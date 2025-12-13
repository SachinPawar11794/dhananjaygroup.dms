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

    WITH iot_base AS (
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
            s.current_work_day AS work_day_date,
            s.current_shift AS slot_shift,
            -- Use default available time of 60 minutes if not available from settings
            60 AS slot_available
        FROM iot_base ib
        LEFT JOIN public.settings s ON
            s.plant = ib."Plant" AND
            s."Machine No." = ib."Machine No." AND
            s.part_no = ib."Part No." AND
            s.operation = ib."Operation"
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
            -- use fallback hour bucket (without spaces to match ShiftSchedule format)
            to_char(date_trunc('hour', ib.ts_ist), 'HH24:00') || '-' ||
            to_char(date_trunc('hour', ib.ts_ist) + interval '1 hour', 'HH24:00') AS time_range_raw,
            COALESCE(ib.slot_shift, ib."Shift", '') AS shift_code,
            -- derive start/end time text
            trim(split_part(
                to_char(date_trunc('hour', ib.ts_ist), 'HH24:00') || '-' ||
                to_char(date_trunc('hour', ib.ts_ist) + interval '1 hour', 'HH24:00')
            , '-', 1)) AS start_text,
            trim(split_part(
                to_char(date_trunc('hour', ib.ts_ist), 'HH24:00') || '-' ||
                to_char(date_trunc('hour', ib.ts_ist) + interval '1 hour', 'HH24:00')
            , '-', 2)) AS end_text,
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
            -- keep time range without spaces to match ShiftSchedule format
            iw.time_range_raw AS time_range
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
        "Machine No.",
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