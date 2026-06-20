import { Setting } from './setting'
import { giteeHttp, githubHttp } from './http'

class BookmarkService {
    private getHttp(setting: Setting) {
        return setting.storageType === 'gitee_gist' ? giteeHttp : githubHttp;
    }

    private getGistId(setting: Setting): string {
        return setting.storageType === 'gitee_gist' ? setting.giteeGistID : setting.gistID;
    }

    private getGistFileName(setting: Setting): string {
        return setting.storageType === 'gitee_gist' ? setting.giteeGistFileName : setting.gistFileName;
    }

    async download() {
        let setting = await Setting.build();
        const client = this.getHttp(setting);
        const gistId = this.getGistId(setting);
        const fileName = this.getGistFileName(setting);

        const authParam = setting.storageType === 'gitee_gist'
            ? `?access_token=${setting.giteeToken}`
            : '';

        let resp = await client.get(`gists/${gistId}${authParam}`).json() as any;

        if (resp?.files) {
            let filenames = Object.keys(resp.files);
            if (filenames.indexOf(fileName) !== -1) {
                let gistFile = resp.files[fileName]
                if (gistFile.truncated && gistFile.raw_url) {
                    const txt = client.get(gistFile.raw_url, { prefixUrl: '' }).text();
                    return txt;
                } else {
                    return gistFile.content
                }
            }
        }
        return null;
    }

    async upload(data: any) {
        let setting = await Setting.build();
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
