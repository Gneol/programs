
import * as path from 'path';
import * as fs from 'fs';
import { isMultimodal } from './multimodal_checker';
import { getGlobalSoulStore } from "../db/program";
import { ModelCacheData } from '../models/cache';
import { FileUtils } from './utils/fileUtils'




export class Bucket {

    static async attach(_object: {
        conversation_id: string, attachments: string[]
    }) {
        try {
            const { conversation_id,  attachments } = _object;

            // Process attachments to save base64 files and get URLs
            const processedAttachments = await this.processAttachments(attachments);

            // Create attachment records for each processed URL
            const store = getGlobalSoulStore();
            const soul = store.get(conversation_id);

            store.update(conversation_id, {
                attachments: [...(soul.attachments), ...processedAttachments] as any
            });
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    static async processAttachments(attachments: string[]): Promise<string[]> {
        const processedAttachments = [];
        for (let i = 0; i < attachments.length; i++) {
            const attachement = attachments[i];
            // check if base64
            const isBase64 = attachement.startsWith('data:');
            if (isBase64) {
                // Save to local disk for now
                try {
                    const filename = `attachment_${Date.now()}_${i}.txt`;
                    const filePath = await FileUtils.saveFileToDisk(filename, attachement);
                    // Return file:// URL for local access
                    processedAttachments.push(filePath);
                } catch (error) {
                    console.error('Failed to save attachment:', error);
                    // Fallback to placeholder
                }
            } else {
                // validate url
                try {
                    new URL(attachement);
                    processedAttachments.push(attachement);
                } catch {
                }
            }
        }
        return processedAttachments;
    }

    // private static getFileExtension(dataUrl: string): string {
    //     const match = dataUrl.match(/^data:[^\/]+\/([a-zA-Z0-9]+);base64,/);
    //     if (match && match[1]) {
    //         const mime = match[1];
    //         // Map common MIME types to extensions
    //         const mimeMap: Record<string, string> = {
    //             'png': 'png',
    //             'jpeg': 'jpg',
    //             'jpg': 'jpg',
    //             'gif': 'gif',
    //             'webp': 'webp',
    //             'svg+xml': 'svg',
    //             'pdf': 'pdf',
    //             'plain': 'txt'
    //         };
    //         return mimeMap[mime] || 'bin';
    //     }
    //     return 'bin';
    // }

    static async retrieve(conversation_id: string, model: ModelCacheData) {
        try {
            const store = getGlobalSoulStore();
            const soul = store.get(conversation_id);
            const records = soul.attachments || [];
            if(records.length === 0) return null;

            const urls = records.map(r => r.url);
            const formattedAttachments = await Bucket.formatAttachment(model, urls, 'image');

            // console.log(records.map(r => r.id), "ATTACHMENTS");

            if (formattedAttachments.length > 1) {
                return {
                    attachments: {
                        role: 'user',
                        content: formattedAttachments
                    },
                    // ids: records.map(r => r.id)
                }
            } else {
                return null;
            }
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    static async detach(id: string) {
        try {
            const store = getGlobalSoulStore();
            await store.update(id, {
                attachments: []
            })
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    static async clear(id: string) {
        try {
           const store = getGlobalSoulStore();
            await store.update(id, {
                attachments: []
            })
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    static async formatAttachment(model: ModelCacheData, image_urls?: string[], type?: 'image' | 'file'): Promise<Array<{ type: "text", text: string } | { type: "image_url", image_url: { url: string } }>> {
        const shouldProcessImages = image_urls && image_urls.length > 0;

        if (type === 'image') {
            if (await isMultimodal(model.provider, model.name) && shouldProcessImages) {


                const imageAttachments = await Promise.all(image_urls.map(async (url) => {
                    const content = await FileUtils.readFileFromDisk(url);

                    return {
                        type: "image_url" as const,
                        image_url: {
                            url: content,
                        },
                    };
                }));

                // Combine text and image attachments
                const attachments: Array<{ type: "text", text: string } | { type: "image_url", image_url: { url: string } }> = [
                    {
                        type: "text" as const,
                        text: "User uploaded images, use image to make proper decisions, preferably write a good description of the images because they would be removed from the conversation history"
                    },
                    ...imageAttachments
                ];

                return attachments;
            }
        }

        return [];
    }
}