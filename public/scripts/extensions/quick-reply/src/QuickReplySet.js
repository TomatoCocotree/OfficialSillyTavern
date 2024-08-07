import { getRequestHeaders, substituteParams } from '../../../../script.js';
import { executeSlashCommands, executeSlashCommandsOnChatInput, executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { SlashCommandScope } from '../../../slash-commands/SlashCommandScope.js';
import { debounceAsync, warn } from '../index.js';
import { QuickReply } from './QuickReply.js';

export class QuickReplySet {
    /**@type {QuickReplySet[]}*/ static list = [];


    static from(props) {
        props.qrList = []; //props.qrList?.map(it=>QuickReply.from(it));
        const instance = Object.assign(new this(), props);
        // instance.init();
        return instance;
    }

    /**
     * @param {String} name - name of the QuickReplySet
     */
    static get(name) {
        return this.list.find(it=>it.name == name);
    }




    /**@type {String}*/ name;
    /**@type {Boolean}*/ disableSend = false;
    /**@type {Boolean}*/ placeBeforeInput = false;
    /**@type {Boolean}*/ injectInput = false;
    /**@type {QuickReply[]}*/ qrList = [];

    /**@type {Number}*/ idIndex = 0;

    /**@type {Boolean}*/ isDeleted = false;

    /**@type {Function}*/ save;

    /**@type {HTMLElement}*/ dom;
    /**@type {HTMLElement}*/ settingsDom;




    constructor() {
        this.save = debounceAsync(()=>this.performSave(), 200);
    }

    init() {
        this.qrList.forEach(qr=>this.hookQuickReply(qr));
    }




    unrender() {
        this.dom?.remove();
        this.dom = null;
    }
    render() {
        this.unrender();
        if (!this.dom) {
            const root = document.createElement('div'); {
                this.dom = root;
                root.classList.add('qr--buttons');
                this.qrList.filter(qr=>!qr.isHidden).forEach(qr=>{
                    root.append(qr.render());
                });
            }
        }
        return this.dom;
    }
    rerender() {
        if (!this.dom) return;
        this.dom.innerHTML = '';
        this.qrList.filter(qr=>!qr.isHidden).forEach(qr=>{
            this.dom.append(qr.render());
        });
    }




    renderSettings() {
        if (!this.settingsDom) {
            this.settingsDom = document.createElement('div'); {
                this.settingsDom.classList.add('qr--set-qrListContents');
                this.qrList.forEach((qr,idx)=>{
                    this.renderSettingsItem(qr, idx);
                });
            }
        }
        return this.settingsDom;
    }
    renderSettingsItem(qr, idx) {
        this.settingsDom.append(qr.renderSettings(idx));
    }




    /**
     *
     * @param {QuickReply} qr The QR to execute.
     * @param {object} options
     * @param {string} [options.message] (null) altered message to be used
     * @param {boolean} [options.isAutoExecute] (false) whether the execution is triggered by auto execute
     * @param {boolean} [options.isEditor] (false) whether the execution is triggered by the QR editor
     * @param {boolean} [options.isRun] (false) whether the execution is triggered by /run or /: (window.executeQuickReplyByName)
     * @param {SlashCommandScope} [options.scope] (null) scope to be used when running the command
     * @returns
     */
    async executeWithOptions(qr, options = {}) {
        options = Object.assign({
            message:null,
            isAutoExecute:false,
            isEditor:false,
            isRun:false,
            scope:null,
        }, options);
        /**@type {HTMLTextAreaElement}*/
        const ta = document.querySelector('#send_textarea');
        const finalMessage = options.message ?? qr.message;
        let input = ta.value;
        if (!options.isAutoExecute && !options.isEditor && !options.isRun && this.injectInput && input.length > 0) {
            if (this.placeBeforeInput) {
                input = `${finalMessage} ${input}`;
            } else {
                input = `${input} ${finalMessage}`;
            }
        } else {
            input = `${finalMessage} `;
        }

        if (input[0] == '/' && !this.disableSend) {
            let result;
            if (options.isAutoExecute || options.isRun) {
                result = await executeSlashCommandsWithOptions(input, {
                    handleParserErrors: true,
                    scope: options.scope,
                });
            } else if (options.isEditor) {
                result = await executeSlashCommandsWithOptions(input, {
                    handleParserErrors: false,
                    scope: options.scope,
                    abortController: qr.abortController,
                    onProgress: (done, total) => qr.updateEditorProgress(done, total),
                });
            } else {
                result = await executeSlashCommandsOnChatInput(input, {
                    scope: options.scope,
                });
            }
            return typeof result === 'object' ? result?.pipe : '';
        }

        ta.value = substituteParams(input);
        ta.focus();

        if (!this.disableSend) {
            // @ts-ignore
            document.querySelector('#send_but').click();
        }
    }
    /**
     * @param {QuickReply} qr
     * @param {String} [message] - optional altered message to be used
     * @param {SlashCommandScope} [scope] - optional scope to be used when running the command
     */
    async execute(qr, message = null, isAutoExecute = false, scope = null) {
        return this.executeWithOptions(qr, {
            message,
            isAutoExecute,
            scope,
        });
    }




    addQuickReply() {
        const id = Math.max(this.idIndex, this.qrList.reduce((max,qr)=>Math.max(max,qr.id),0)) + 1;
        this.idIndex = id + 1;
        const qr = QuickReply.from({ id });
        this.qrList.push(qr);
        this.hookQuickReply(qr);
        if (this.settingsDom) {
            this.renderSettingsItem(qr, this.qrList.length - 1);
        }
        if (this.dom) {
            this.dom.append(qr.render());
        }
        this.save();
        return qr;
    }

    hookQuickReply(qr) {
        qr.onExecute = (_, options)=>this.executeWithOptions(qr, options);
        qr.onDelete = ()=>this.removeQuickReply(qr);
        qr.onUpdate = ()=>this.save();
    }

    removeQuickReply(qr) {
        this.qrList.splice(this.qrList.indexOf(qr), 1);
        this.save();
    }


    toJSON() {
        return {
            version: 2,
            name: this.name,
            disableSend: this.disableSend,
            placeBeforeInput: this.placeBeforeInput,
            injectInput: this.injectInput,
            qrList: this.qrList,
            idIndex: this.idIndex,
        };
    }


    async performSave() {
        const response = await fetch('/api/quick-replies/save', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(this),
        });

        if (response.ok) {
            this.rerender();
        } else {
            warn(`Failed to save Quick Reply Set: ${this.name}`);
            console.error('QR could not be saved', response);
        }
    }

    async delete() {
        const response = await fetch('/api/quick-replies/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(this),
        });

        if (response.ok) {
            this.unrender();
            const idx = QuickReplySet.list.indexOf(this);
            QuickReplySet.list.splice(idx, 1);
            this.isDeleted = true;
        } else {
            warn(`Failed to delete Quick Reply Set: ${this.name}`);
        }
    }
}
