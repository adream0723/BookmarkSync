import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'

export class SettingBase implements Options {
    constructor() { }
    [key: string]: string | number | boolean;

    storageType: string = 'gitee_gist';

    // GitHub Gist
    githubToken: string = '';
    gistID: string = '';
    gistFileName: string = 'BookmarkSync.json';

    // Gitee Gist
    giteeToken: string = '';
    giteeGistID: string = '';
    giteeGistFileName: string = 'BookmarkSync.json';

    enableNotify: boolean = true;
    formatJson: boolean = false;
    conflictStrategy: string = 'smart';
}

export class Setting extends SettingBase {
    private constructor() { super() }
    static async build() {
        let options = await optionsStorage.getAll();
        let setting = new Setting();

        setting.storageType = options.storageType;
        setting.enableNotify = options.enableNotify;

        // GitHub Gist
        setting.gistID = options.gistID;
        setting.gistFileName = options.gistFileName;
        setting.githubToken = options.githubToken;

        // Gitee Gist
        setting.giteeToken = options.giteeToken;
        setting.giteeGistID = options.giteeGistID;
        setting.giteeGistFileName = options.giteeGistFileName;

        return setting;
    }
}
