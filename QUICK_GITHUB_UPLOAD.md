# ⚡ Quick GitHub Upload Guide

## ✅ Your Git is Ready!

Your repository is initialized and files are committed. Now follow these steps:

## Step 1: Create GitHub Repository

1. **Go to GitHub:** https://github.com/new
2. **Repository name:** `iot-management-system` (or your preferred name)
3. **Description:** "IoT Machine Settings Management System using Supabase"
4. **Visibility:** Public or Private (your choice)
5. **DO NOT** check "Initialize with README" (we already have one)
6. **Click "Create repository"**

## Step 2: Connect and Push

After creating the repository, GitHub will show you commands. Use these:

```bash
# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/iot-management-system.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Or if you prefer SSH:**
```bash
git remote add origin git@github.com:YOUR_USERNAME/iot-management-system.git
git branch -M main
git push -u origin main
```

## 🎯 Quick Commands (Copy & Paste)

**Replace `YOUR_USERNAME` with your GitHub username:**

```bash
git remote add origin https://github.com/YOUR_USERNAME/iot-management-system.git
git branch -M main
git push -u origin main
```

## ✅ What's Already Done

- ✅ Git initialized
- ✅ All files staged
- ✅ Initial commit created
- ✅ .gitignore configured (node_modules, dist, .env excluded)

## 📦 What Will Be Uploaded

✅ **Uploaded:**
- All source code
- Configuration files
- Documentation
- README.md

❌ **NOT Uploaded** (protected by .gitignore):
- `node_modules/` (dependencies)
- `dist/` (build output)
- `.env` (environment variables)

## 🚀 After Uploading

### Deploy to Vercel (Recommended)

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Select your repository
5. Click "Deploy"
6. Done! Your app will be live in minutes

---

**Ready?** Create the GitHub repo and run the commands above! 🚀

