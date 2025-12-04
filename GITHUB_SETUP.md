# 🚀 GitHub Setup Guide

## Step-by-Step Instructions

### Step 1: Create GitHub Repository

1. **Go to GitHub**
   - Visit: https://github.com
   - Login to your account

2. **Create New Repository**
   - Click the **"+"** icon (top right)
   - Select **"New repository"**

3. **Repository Settings**
   - **Repository name:** `iot-management-system` (or your preferred name)
   - **Description:** "IoT Machine Settings Management System using Supabase"
   - **Visibility:** Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
   - Click **"Create repository"**

### Step 2: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/iot-management-system.git

# Or if using SSH:
git remote add origin git@github.com:YOUR_USERNAME/iot-management-system.git
```

### Step 3: Commit and Push

```bash
# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: IoT Management System with modular architecture"

# Push to GitHub
git branch -M main
git push -u origin main
```

## 🔐 Important: Protect Sensitive Data

### Before Pushing - Check These Files:

1. **Supabase Credentials**
   - ✅ Already in code (anon key is safe to expose)
   - ✅ RLS policies protect your data

2. **Environment Variables** (if you add them later)
   - Create `.env` file (already in .gitignore)
   - Never commit `.env` files

3. **Node Modules**
   - ✅ Already in .gitignore
   - Will not be uploaded

## 📝 What Will Be Uploaded

✅ **Will be uploaded:**
- All source code (`src/` folder)
- HTML, CSS, JS files
- Configuration files (package.json, vite.config.js, vercel.json)
- Documentation files
- README.md

❌ **Will NOT be uploaded** (in .gitignore):
- `node_modules/` folder
- `.env` files
- Build output (`dist/` folder)
- IDE files

## 🎯 After Pushing to GitHub

### Option 1: Deploy to Vercel (Recommended)

1. **Go to Vercel**
   - Visit: https://vercel.com
   - Sign up/login with GitHub

2. **Import Project**
   - Click "Add New Project"
   - Select your GitHub repository
   - Vercel will auto-detect Vite
   - Click "Deploy"

3. **Done!**
   - Your app will be live in minutes
   - Vercel will auto-deploy on every push

### Option 2: Deploy to GitHub Pages

1. **Go to Repository Settings**
2. **Pages** section
3. **Source:** Select "main" branch
4. **Folder:** Select "/ (root)"
5. **Save**

## 🔄 Future Updates

After making changes:

```bash
# Stage changes
git add .

# Commit changes
git commit -m "Description of changes"

# Push to GitHub
git push
```

## 📚 Repository Structure on GitHub

Your repository will show:
```
├── src/                    # Source code
├── index.html             # Main HTML
├── script.js              # Application logic
├── style.css              # Styles
├── package.json           # Dependencies
├── vite.config.js         # Build config
├── vercel.json            # Deployment config
├── README.md              # Documentation
└── .gitignore             # Git ignore rules
```

## ✅ Checklist

Before pushing:
- [ ] Review .gitignore (already done ✅)
- [ ] Check no sensitive data in code (Supabase anon key is OK ✅)
- [ ] Test application works locally ✅
- [ ] Create GitHub repository
- [ ] Add remote origin
- [ ] Commit and push

---

**Ready to push?** Follow the steps above! 🚀

