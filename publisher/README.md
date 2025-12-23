# autofold
A chrome extension to automatically fold bad hands. Currently built for pokernow.

![](example_range.png)

## how to install

### For Development (Unminified)
1. Download repo
2. Go to `chrome://extensions/` in your Chrome browser
3. Enable "Developer mode"
4. Click `Load unpacked`
5. Select the `src` folder
6. Should be good to go

### For Production (Minified Build)
1. Download repo
2. Install dependencies: `npm install`
3. Build extension: `npm run build`
4. Go to `chrome://extensions/` in your Chrome browser
5. Enable "Developer mode"
6. Click `Load unpacked`
7. Select the `dist` folder
8. Should be good to go

> **Note**: The production build minifies code (~60% size reduction) while preserving all WebSocket and message-passing compatibility. See [BUILD.md](BUILD.md) for details.

## todo
- add ranges for different positions?
- write how to install
- wait until game starts/existing card container before checking (kinda solved?)


## debugging
If your extension doesn't work, try the following:
- disable adblockers


## bugs
- good hand sound plays again when winning a hand
- extension only loads sometimes
- weird pokernow font issue? might be pokernow related


## resources
- [Migration from v2 to v3](https://stackoverflow.com/questions/63308160/how-to-migrate-manifest-version-2-to-v3-for-chrome-extension)
- [Accessing Page From Extension](https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions)
- [Passing Essentials](https://www.freecodecamp.org/news/chrome-extension-message-passing-essentials/)
- [Good Summary](https://javascript.plainenglish.io/creating-a-chrome-extension-with-react-d92db20550cb)
