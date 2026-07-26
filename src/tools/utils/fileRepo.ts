import { getGlobalSoulStore } from "../../db/program";
import { resolveAgentWorkspace } from "../pathUtils";
import fs from 'fs';
import path from 'path';



interface Note {
    agentId: string;
    message: string;
    timestamp: string;
}

interface PermissionEntry {
    owner: string;
    editors: string[]
    notes: Note[];
}

type KineticData = {
    metaPath: string,
    file: string
    fileRecord: PermissionEntry
}

const store = getGlobalSoulStore();

type StoreData = Record<string, PermissionEntry>


export class FileMetaManager {

    globalCache: Map<string, StoreData>

    constructor() {
        this.globalCache = new Map();
    }

    getRecord(id: string, file: string): KineticData {
        const workspace = resolveAgentWorkspace(id);
        const metaPathParent = `${workspace}/.gneol`;
        const metaPath = `${workspace}/.gneol/files.json`;
        let metaData: StoreData = {};

        if (this.globalCache.has(metaPath)) {
            metaData = this.globalCache.get(metaPath);
        } else {


            // ensure it exist
            if (!fs.existsSync(metaPathParent)) {
                fs.mkdirSync(metaPathParent, { recursive: true });
            }

            if (!fs.existsSync(metaPath)) {
                fs.writeFileSync(metaPath, '{}');
            } else {
                const _file = fs.readFileSync(metaPath, 'utf-8');
                try {
                    metaData = JSON.parse(_file ? _file : '{}');
                } catch (error) {
                    console.log(error)
                    // we can cache the fucked up file somewhere
                }
            }
            this.globalCache.set(metaPath, metaData);
        }


        const fileRecord: PermissionEntry = metaData[file] || {
            editors: [],
            notes: [],
            owner: id
        };
        return {
            metaPath,
            file,
            fileRecord
        }
    }

    saveRecord(update: KineticData) {
        const { metaPath, fileRecord, file } = update;
        const metaData = this.globalCache.get(metaPath);
        metaData[file] = fileRecord;
        fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2))
    }

    authorize(agentId: string, file: string, id: string) {
        let data = this.getRecord(id, file);

        // check
        if(data.fileRecord.owner !== id){
            return `You cannot auhtorize this agent, you are not the owner of the file speak to ${data.fileRecord.owner}`
        }

        if (!data.fileRecord.editors.includes(agentId)) {
            data.fileRecord.editors.push(agentId);
        }
        this.saveRecord(data);
        return null;
    }

    revokeAuthorization(file: string, agentId: string, callerId: string) {
        let data = this.getRecord(callerId, file);
        if(data.fileRecord.owner !== callerId){
            return 'You cannot revoke access, you are not the owner of the file'
        }
        if(data.fileRecord.owner === agentId){
            return 'cannot revoke access for the owner of the file'
        }
        const index = data.fileRecord.editors.indexOf(agentId);
        if (index !== -1) {
            data.fileRecord.editors.splice(index, 1);
        }
        this.saveRecord(data);
        return null;
    }

    isAuthorized(file: string, id: string) {
        let data = this.getRecord(id, file);
        const owner = data.fileRecord.owner;
        const authorized = owner === id || data.fileRecord.editors.includes(id);
        return {
            authorized,
            owner
        }
    }

    writeLog(file: string, id: string, message: string) {
        let data = this.getRecord(id, file);
        data.fileRecord.notes.push({
            agentId: id,
            message,
            timestamp: new Date().toISOString()
        })
        this.saveRecord(data);
    }

    readLogsFor(agentId: string, file: string, id: string) {
        let data = this.getRecord(id, file);
        if (agentId) {
            return data.fileRecord.notes.filter(n => n.agentId === agentId);
        }
        return data.fileRecord.notes;
    }
}


export const fileMetaManager = new FileMetaManager();