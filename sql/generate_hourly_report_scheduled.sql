CREATE OR REPLACE FUNCTION public.generate_hourly_report_scheduled()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_iot_count    integer;
    v_report_count integer;
    v_start_time   timestamptz := now();
    v_freq_days    integer := 8;
BEGIN
    -- Try to read archive window from get_archive_config (if exists)
    BEGIN
        SELECT COALESCE((cfg->>0)::jsonb->>'archive_frequency_days', '8')::int
        INTO v_freq_days
        FROM public.get_archive_config() cfg;
    EXCEPTION WHEN OTHERS THEN
        v_freq_days := 8;
    END;

    -- Count recent IoT rows (non-archived)
    SELECT COUNT(*) INTO v_iot_count
    FROM "IoT Database"
    WHERE "Timestamp" >= now() - (v_freq_days || ' days')::interval
      AND COALESCE(archived, false) = false;

    IF v_iot_count = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'No IoT data to process',
            'iot_records_processed', 0,
            'reports_created', 0,
            'executed_at', now(),
            'duration_ms', 0
        );
    END IF;

    WITH shift_slots AS (
        -- Normalize time strings to handle both "HH:MM - HH:MM" and "HH:MM-HH:MM"
        SELECT
            "Shift" AS shift_code,
            "Time"  AS time_range,
            (trim(split_part(replace("Time", ' ', ''), '-', 1)))::time AS start_time,
            (trim(split_part(replace("Time", ' ', ''), '-', 2)))::time AS end_time,
            COALESCE("Available Time", 0)::numeric AS available_minutes
        FROM "ShiftSchedule"
    ),
    iot_base AS (
        SELECT
            i.*,
            timezone('Asia/Kolkata', i."Timestamp") AS ts_ist
        FROM "IoT Database" i
        WHERE i."Timestamp" >= now() - (v_freq_days || ' days')::interval
          AND COALESCE(i.archived, false) = false
          AND i."Timestamp" IS NOT NULL
    ),
    iot_enriched AS (
        SELECT
            ib.*,
            CASE WHEN ib.ts_ist::time < time '07:00'
                 THEN (ib.ts_ist::date - 1)
                 ELSE ib.ts_ist::date
            END AS work_day_date,
            (
                SELECT ss.time_range
                FROM shift_slots ss
                WHERE (
                    ss.start_time <= ss.end_time
                    AND ib.ts_ist::time >= ss.start_time
                    AND ib.ts_ist::time < ss.end_time
                ) OR (
                    ss.start_time > ss.end_time
                    AND (
                        ib.ts_ist::time >= ss.start_time
                        OR ib.ts_ist::time < ss.end_time
                    )
                )
                ORDER BY ss.start_time
                LIMIT 1
            ) AS slot_time_range,
            (
                SELECT ss.shift_code
                FROM shift_slots ss
                WHERE (
                    ss.start_time <= ss.end_time
                    AND ib.ts_ist::time >= ss.start_time
                    AND ib.ts_ist::time < ss.end_time
                ) OR (
                    ss.start_time > ss.end_time
                    AND (
                        ib.ts_ist::time >= ss.start_time
                        OR ib.ts_ist::time < ss.end_time
                    )
                )
                ORDER BY ss.start_time
                LIMIT 1
            ) AS slot_shift,
            (
                SELECT ss.available_minutes
                FROM shift_slots ss
                WHERE (
                    ss.start_time <= ss.end_time
                    AND ib.ts_ist::time >= ss.start_time
                    AND ib.ts_ist::time < ss.end_time
                ) OR (
                    ss.start_time > ss.end_time
                    AND (
                        ib.ts_ist::time >= ss.start_time
                        OR ib.ts_ist::time < ss.end_time
                    )
                )
                ORDER BY ss.start_time
                LIMIT 1
            ) AS slot_available
        FROM iot_base ib
    ),
    iot_prepped AS (
        SELECT
            ib."Plant",
            ib."Machine No." AS machine_no,
            ib."Part No.",
            ib."Part Name",
            ib."Operation",
            ib."Operator Code",
            ib."Loss Reasons",
            ib."Cell Name",
            ib."Cell Leader",
            ib."Cycle Time",
            ib."Part Count Per Cycle",
            ib."Work Day Date",
            ib.ts_ist,
            ib.work_day_date AS work_day_date_calc,
            -- choose slot range or fallback hour bucket (no spaces)
            COALESCE(ib.slot_time_range,
                to_char(date_trunc('hour', ib.ts_ist), 'HH24:00') || '-' ||
                to_char(date_trunc('hour', ib.ts_ist) + interval '1 hour', 'HH24:00')
            ) AS time_range_raw,
            COALESCE(ib.slot_shift, ib."Shift", '') AS shift_code,
            -- derive start/end time text
            trim(split_part(COALESCE(ib.slot_time_range,
                to_char(date_trunc('hour', ib.ts_ist), 'HH24:00') || '-' ||
                to_char(date_trunc('hour', ib.ts_ist) + interval '1 hour', 'HH24:00')
            ), '-', 1)) AS start_text,
            trim(split_part(COALESCE(ib.slot_time_range,
                to_char(date_trunc('hour', ib.ts_ist), 'HH24:00') || '-' ||
                to_char(date_trunc('hour', ib.ts_ist) + interval '1 hour', 'HH24:00')
            ), '-', 2)) AS end_text,
            COALESCE(ib.slot_available, 60)::numeric AS slot_available_minutes,
            COALESCE(ib."Value", 0) AS val
        FROM iot_enriched ib
    ),
    iot_with_slots AS (
        SELECT
            ip.*,
            -- parse times safely
            (ip.start_text)::time AS start_t,
            (ip.end_text)::time AS end_t
        FROM iot_prepped ip
    ),
    iot_with_slot_bounds AS (
        SELECT
            iw.*,
            timezone('Asia/Kolkata', date_trunc('day', iw.ts_ist)) + iw.start_t AS slot_start_ist,
            timezone('Asia/Kolkata', date_trunc('day', iw.ts_ist)) + iw.end_t
                + CASE WHEN iw.end_t <= iw.start_t THEN interval '1 day' ELSE interval '0' END AS slot_end_ist,
            -- keep cleaned time range with space for output
            replace(iw.time_range_raw, '-', ' - ') AS time_range
        FROM iot_with_slots iw
    ),
    iot_with_segments AS (
        SELECT
            ip.*,
            LEAD(ip.ts_ist) OVER (
                PARTITION BY ip."Plant", ip.machine_no, ip.time_range, ip.slot_start_ist, ip.slot_end_ist
                ORDER BY ip.ts_ist
            ) AS next_ts,
            NULLIF(
                LEAST(
                    COALESCE(LEAD(ip.ts_ist) OVER (
                        PARTITION BY ip."Plant", ip.machine_no, ip.time_range, ip.slot_start_ist, ip.slot_end_ist
                        ORDER BY ip.ts_ist
                    ), ip.slot_end_ist),
                    ip.slot_end_ist
                ),
                NULL
            ) AS segment_end_raw
        FROM iot_with_slot_bounds ip
    ),
    iot_with_seg_minutes AS (
        SELECT
            iw.*,
            GREATEST(
                0,
                EXTRACT(
                    EPOCH FROM (
                        COALESCE(
                            CASE
                                WHEN iw.segment_end_raw IS NULL THEN iw.slot_end_ist
                                ELSE iw.segment_end_raw
                            END,
                            iw.slot_end_ist
                        ) - iw.ts_ist
                    )
                ) / 60.0
            ) AS segment_minutes
        FROM iot_with_segments iw
    ),
    grouped AS (
        SELECT
            to_char(p.ts_ist, 'DD/MM/YYYY') AS date_formatted,
            p.time_range,
            p.shift_code,
            COALESCE(p."Operator Code", '') AS operator_code,
            COALESCE(p."Part No.", '') AS part_no,
            COALESCE(p."Part Name", '') AS part_name,
            COALESCE(p."Operation", '') AS operation,
            COALESCE(p."Loss Reasons", 'No Loss') AS loss_reason,
            COALESCE(p."Plant", '') AS plant,
            COALESCE(p.machine_no, '') AS machine_no,
            COALESCE(p."Cell Name", '') AS cell_name,
            COALESCE(p."Cell Leader", '') AS cell_leader,
            COALESCE(NULLIF(p."Cycle Time",0), 1) AS cycle_time,
            COALESCE(NULLIF(p."Part Count Per Cycle",0), 1) AS part_count_per_cycle,
            SUM(p.segment_minutes) AS available_minutes,
            SUM(p.val * COALESCE(NULLIF(p."Part Count Per Cycle",0),1)) AS total_produced_qty,
            SUM((p.val * COALESCE(NULLIF(p."Cycle Time",0),1)) / 60.0) AS operating_time,
            MIN(COALESCE(p."Work Day Date", p.work_day_date_calc)) AS work_day_date_pref,
            MIN(p.ts_ist) AS first_ts
        FROM iot_with_seg_minutes p
        GROUP BY
            to_char(p.ts_ist, 'DD/MM/YYYY'),
            p.time_range,
            p.shift_code,
            COALESCE(p."Operator Code", ''),
            COALESCE(p."Part No.", ''),
            COALESCE(p."Part Name", ''),
            COALESCE(p."Operation", ''),
            COALESCE(p."Loss Reasons", 'No Loss'),
            COALESCE(p."Plant", ''),
            COALESCE(p.machine_no, ''),
            COALESCE(p."Cell Name", ''),
            COALESCE(p."Cell Leader", ''),
            COALESCE(NULLIF(p."Cycle Time",0), 1),
            COALESCE(NULLIF(p."Part Count Per Cycle",0), 1)
    ),
    final_rows AS (
        SELECT
            g.*,
            CASE
                WHEN g.available_minutes = 0 THEN 'Planned Shutdown'
                WHEN g.loss_reason = 'No Plan' AND g.total_produced_qty = 0 THEN 'No Plan'
                WHEN g.loss_reason = 'No Plan' AND g.total_produced_qty > 0 THEN 'Production Occurred'
                ELSE g.loss_reason
            END AS final_loss_reason,
            COALESCE(g.work_day_date_pref,
                     CASE WHEN (g.first_ts AT TIME ZONE 'Asia/Kolkata')::time < time '07:00'
                          THEN ((g.first_ts AT TIME ZONE 'Asia/Kolkata')::date - 1)
                          ELSE (g.first_ts AT TIME ZONE 'Asia/Kolkata')::date
                     END) AS work_day_date_final
        FROM grouped g
    ),
    final_with_iot_bucket AS (
        SELECT
            f.*,
            f.work_day_date_final AS iot_date_bucket
        FROM final_rows f
    ),
    sorted AS (
        SELECT
            f.*,
            ROW_NUMBER() OVER (
                ORDER BY f.iot_date_bucket, f.time_range, f.machine_no
            ) AS sr_no
        FROM final_with_iot_bucket f
    ),
    distinct_dates AS (
        SELECT DISTINCT f.iot_date_bucket::date AS iot_date
        FROM final_with_iot_bucket f
    ),
    deleted AS (
        DELETE FROM "HourlyReport" hr
        USING distinct_dates d
        WHERE (
            -- Match date-typed rows
            hr."IoT Date" = d.iot_date
            -- Match text-typed or formatted rows (legacy)
            OR hr."IoT Date"::text = to_char(d.iot_date, 'YYYY-MM-DD')
            OR hr."IoT Date"::text = to_char(d.iot_date, 'DD/MM/YYYY')
            OR hr."IoT Date"::text = to_char(d.iot_date, 'MM/DD/YYYY')
        )
          AND COALESCE(hr.archived, false) = false
        RETURNING 1
    )
    INSERT INTO "HourlyReport" (
        "Plant",
        "Machine Name",
        "Sr No",
        "Shift",
        "IoT Date",
        "Time",
        "Work Day Date",
        "Operator",
        "Part No.",
        "Part Name",
        "Operation",
        "Cycle Time (Second) per piece",
        "Hourly Target",
        "Total Produced Qty.",
        "OK Qty.",
        "Rej. Qty.",
        "Rew. Qty.",
        "Defect Type",
        "Available Time (Minutes)",
        "Operating Time as per Cycle Time (Minutes)",
        "Total Down Time (Minutes)",
        "Loss Reasons",
        "Cell Name",
        "Cell Leader",
        archived,
        created_at,
        updated_at
    )
    SELECT
        s.plant,
        s.machine_no,
        s.sr_no,
        s.shift_code,
        s.iot_date_bucket::date,
        s.time_range,
        s.work_day_date_final,
        s.operator_code,
        s.part_no,
        s.part_name,
        s.operation,
        s.cycle_time,
        CASE WHEN s.available_minutes > 0
             THEN FLOOR((s.available_minutes * 60) / s.cycle_time * s.part_count_per_cycle)
             ELSE 0 END AS hourly_target,
        s.total_produced_qty::integer,
        ''::text,
        ''::text,
        ''::text,
        ''::text,
        s.available_minutes,
        ROUND(s.operating_time, 2) AS operating_time_minutes,
        ROUND(GREATEST(0, s.available_minutes - s.operating_time), 2) AS total_down_time_minutes,
        s.final_loss_reason,
        s.cell_name,
        s.cell_leader,
        false,
        now(),
        now()
    FROM sorted s;

    GET DIAGNOSTICS v_report_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Hourly report generated (scheduled)',
        'iot_records_processed', v_iot_count,
        'reports_created', v_report_count,
        'executed_at', now(),
        'duration_ms', EXTRACT(milliseconds FROM (now() - v_start_time))
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'executed_at', now()
    );
END;
$$;

-- Recalculate settings counts for the current work day and current shift only,
-- for a specific Plant + Machine + Part No. + Operation combination.
-- Target comes from HourlyReport."Hourly Target"
-- Actual comes from "IoT Database"."Value"
-- Ensure settings has columns to store the evaluated shift and work day
ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS current_shift text,
    ADD COLUMN IF NOT EXISTS current_work_day date;

-- Remove legacy/duplicate count update functions and triggers (if they exist)
DROP TRIGGER IF EXISTS after_hourlyreport_update_settings ON public."HourlyReport";
DROP TRIGGER IF EXISTS trig_refresh_settings_counts_from_hourly ON public."HourlyReport";
DROP TRIGGER IF EXISTS trig_refresh_settings_from_hourly ON public."HourlyReport";
DROP TRIGGER IF EXISTS trigger_update_settings_counts ON public."HourlyReport";
DROP TRIGGER IF EXISTS after_iotdata_update_settings ON public."IoT Database";
DROP FUNCTION IF EXISTS public.trg_hourlyreport_update_settings() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_settings_counts_from_hourly() CASCADE;
DROP FUNCTION IF EXISTS public.update_settings_counts() CASCADE;
DROP FUNCTION IF EXISTS public.recompute_settings_counts(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_all_settings_counts() CASCADE;

CREATE OR REPLACE FUNCTION public.refresh_settings_counts_current_shift(
    p_plant     text,
    p_machine   text,
    p_part_no   text,
    p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_work_day      date;
    v_current_shift text;
    v_target_count  numeric := 0;
    v_actual_count  numeric := 0;
    v_rows_updated  integer := 0;
BEGIN
    -- Validate input: must have all key fields
    IF p_plant IS NULL OR p_machine IS NULL OR p_part_no IS NULL OR p_operation IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Missing key fields (plant/machine/part_no/operation)'
        );
    END IF;

    -- Determine work day using 07:00 IST cutoff
    v_work_day := CASE
                    WHEN (now() AT TIME ZONE 'Asia/Kolkata')::time < time '07:00'
                      THEN (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
                    ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date
                  END;

    -- Determine current shift from ShiftSchedule based on current IST time
    SELECT ss."Shift" INTO v_current_shift
    FROM "ShiftSchedule" ss
    WHERE ss."Plant" = p_plant
      AND (
            (split_part(ss."Time", ' - ', 1))::time <= (split_part(ss."Time", ' - ', 2))::time
            AND (now() AT TIME ZONE 'Asia/Kolkata')::time >= (split_part(ss."Time", ' - ', 1))::time
            AND (now() AT TIME ZONE 'Asia/Kolkata')::time <  (split_part(ss."Time", ' - ', 2))::time
          )
       OR (
            (split_part(ss."Time", ' - ', 1))::time > (split_part(ss."Time", ' - ', 2))::time
            AND (
                  (now() AT TIME ZONE 'Asia/Kolkata')::time >= (split_part(ss."Time", ' - ', 1))::time
               OR (now() AT TIME ZONE 'Asia/Kolkata')::time <  (split_part(ss."Time", ' - ', 2))::time
                )
          )
    ORDER BY ss."Time"
    LIMIT 1;

    -- If no shift is found, exit gracefully
    IF v_current_shift IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No current shift found in ShiftSchedule',
            'work_day', v_work_day,
            'updated_rows', 0
        );
    END IF;

    -- Target from HourlyReport for current work day and shift
    SELECT COALESCE(SUM(hr."Hourly Target"), 0) INTO v_target_count
    FROM public."HourlyReport" hr
    WHERE hr."Plant" = p_plant
      AND hr."Machine Name" = p_machine
      AND hr."Part No." = p_part_no
      AND hr."Operation" = p_operation
      AND hr."Work Day Date" = v_work_day
      AND hr."Shift" = v_current_shift
      AND COALESCE(hr.archived, false) = false;

    -- Actual from IoT Database for current work day and shift
    SELECT COALESCE(SUM(iot."Value"), 0) INTO v_actual_count
    FROM public."IoT Database" iot
    WHERE iot."Plant" = p_plant
      AND iot."Machine No." = p_machine
      AND iot."Part No." = p_part_no
      AND iot."Operation" = p_operation
      AND iot."Work Day Date" = v_work_day
      AND iot."Shift" = v_current_shift
      AND COALESCE(iot.archived, false) = false;

    -- Update matching settings rows
    UPDATE public.settings s
    SET target_count     = v_target_count,
        actual_count     = v_actual_count,
        current_shift    = v_current_shift,
        current_work_day = v_work_day,
        updated_at       = now()
    WHERE s.plant = p_plant
      AND s."Machine No." = p_machine
      AND s.part_no = p_part_no
      AND s.operation = p_operation;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'work_day', v_work_day,
        'shift', v_current_shift,
        'updated_rows', COALESCE(v_rows_updated, 0),
        'target_count', v_target_count,
        'actual_count', v_actual_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Trigger helper: call refresh_settings_counts_current_shift() after data changes
CREATE OR REPLACE FUNCTION public.trg_refresh_settings_counts_current_shift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_plant     text;
    v_machine   text;
    v_part_no   text;
    v_operation text;
BEGIN
    -- Prevent infinite recursion when this trigger fires due to our own updates
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    -- Determine key fields from the triggering table/row
    IF TG_TABLE_NAME = 'IoT Database' THEN
        v_plant     := COALESCE(NEW."Plant", OLD."Plant");
        v_machine   := COALESCE(NEW."Machine No.", OLD."Machine No.");
        v_part_no   := COALESCE(NEW."Part No.", OLD."Part No.");
        v_operation := COALESCE(NEW."Operation", OLD."Operation");
    ELSIF TG_TABLE_NAME = 'HourlyReport' THEN
        v_plant     := COALESCE(NEW."Plant", OLD."Plant");
        v_machine   := COALESCE(NEW."Machine Name", OLD."Machine Name");
        v_part_no   := COALESCE(NEW."Part No.", OLD."Part No.");
        v_operation := COALESCE(NEW."Operation", OLD."Operation");
    ELSIF TG_TABLE_NAME = 'settings' THEN
        v_plant     := COALESCE(NEW.plant, OLD.plant);
        v_machine   := COALESCE(NEW."Machine No.", OLD."Machine No.");
        v_part_no   := COALESCE(NEW.part_no, OLD.part_no);
        v_operation := COALESCE(NEW.operation, OLD.operation);
    END IF;

    -- Only proceed when all key fields are present
    IF v_plant IS NOT NULL AND v_machine IS NOT NULL AND v_part_no IS NOT NULL AND v_operation IS NOT NULL THEN
        PERFORM public.refresh_settings_counts_current_shift(
            v_plant,
            v_machine,
            v_part_no,
            v_operation
        );
    END IF;
    RETURN NULL;
END;
$$;

-- Hook the refresh to changes in IoT Database, HourlyReport, and settings
DROP TRIGGER IF EXISTS trg_refresh_settings_counts_iot ON public."IoT Database";
CREATE TRIGGER trg_refresh_settings_counts_iot
AFTER INSERT OR UPDATE OR DELETE ON public."IoT Database"
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_settings_counts_current_shift();

DROP TRIGGER IF EXISTS trg_refresh_settings_counts_hourly ON public."HourlyReport";
CREATE TRIGGER trg_refresh_settings_counts_hourly
AFTER INSERT OR UPDATE OR DELETE ON public."HourlyReport"
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_settings_counts_current_shift();

DROP TRIGGER IF EXISTS trg_refresh_settings_counts_settings ON public.settings;
CREATE TRIGGER trg_refresh_settings_counts_settings
AFTER INSERT OR UPDATE OR DELETE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_settings_counts_current_shift();