# AutoRange - Chrome Extension

A Chrome extension that automatically folds bad poker hands based on your customizable range. Currently supports PokerNow.club and Ignition Casino.

![](example_range.png)

## Features

- Automatically folds hands outside your configured range
- Customizable range table interface
- Visual feedback with sound alerts for playable hands
- Supports multiple poker sites (PokerNow.club, Ignition Casino)
- Real-time hand analysis

## Installation from GitHub

### Prerequisites

- Google Chrome browser (latest version recommended)
- Git (optional, for cloning) or ability to download ZIP files
- Node.js and npm (only needed for production builds)

### Method 1: Quick Install (Development Version)

This method installs the extension directly from the source code without building.

1. **Download the Repository**
   
    - Download ZIP
     - Go to the GitHub repository
     - Click the green "Code" button
     - Select "Download ZIP"
     - Extract the ZIP file to a folder on your computer

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to: Menu (⋮) → Extensions → Manage extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner of the extensions page
   - This enables the ability to load unpacked extensions

4. **Load the Extension**
   - Click the "Load unpacked" button (top-left)
   - Navigate to the downloaded repository folder
   - Select the `AutoFold` folder (not the root folder)
   - Click "Select Folder"

5. **Verify Installation**
   - You should see the Autofold extension appear in your extensions list
   - The extension icon should appear in your Chrome toolbar
   - Click the icon to open the range configuration popup

### Method 2: Production Build (Recommended)

This method creates an optimized, minified version of the extension.

1. **Download the Repository**
   - Follow step 1 from Method 1 above

2. **Install Dependencies**
   npm install
   3. **Build the Extension**
   npm run build
      This creates a `dist` folder with the optimized extension files.

4. **Load the Extension**
   - Open `chrome://extensions/` in Chrome
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Navigate to the repository folder
   - Select the folder
   - Click "Select Folder"

### Visual Guide
