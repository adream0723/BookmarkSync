import optionsStorage from './optionsStorage'
import { giteeHttp, githubHttp } from './http'
import type { StoredOptions } from './optionsStorage'

class BookmarkService {
    private getHttp(setting: StoredOptions) {
        return setting.storageType === 'gitee_gist' ? giteeHttp : githubHttp;
    }

    private getGistId(setting: StoredOptions): string {
        return setting.storageType === 'gitee_gist' ? setting.giteeGistID : setting.gistID;
    }

    private getGistFileName(setting: StoredOptions): string {
        return setting.storageType === 'gitee_gist' ? setting.giteeGistFileName : setting.gistFileName;
    }

    async download() {
        const setting = await optionsStorage.getAll();
        const client = this.getHttp(setting);
        const gistId = this.getGistId(setting);
        const fileName = this.getGistFileName(setting);

        const authParam = setting.storageType === 'gitee_gist'
            ? `?access_token=${setting.giteeToken}`
            : '';

        const resp = await client.get(`gists/${gistId}${authParam}`).json() as any;

        if (resp?.files) {
            const filenames = Object.keys(resp.files);
            if (filenames.indexOf(fileName) !== -1) {
                const gistFile = resp.files[fileName]
                if (gistFile.truncated && gistFile.raw_url) {
                    return client.get(gistFile.raw_url, { prefixUrl: '' }).text();
                } else {
                    return gistFile.content
                }
            }
        }
        return null;
    }

    async upload(data: any) {
        const setting = await optionsStorage.getAll();
        const client = this.getHttp(setting);
        const gistId = this.getGistId(setting);

        if (setting.storageType === 'gitee_gist') {
            return client.patch(`gists/${gistId}`, {
                json: { ...data, access_token: setting.giteeToken }
            }).json();
        } else {
            return client.patch(`gists/${gistId}`, { json: data }).json();
        }
    }
}

export default new BookmarkService()
