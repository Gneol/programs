import { clearChat, current, pushSystemMessage } from "../interface/chat";
import { registerCommand } from "../utils/commandRegistry";
import { showPrompt } from "../utils/prompt";
import { listTools, createTool, viewTool, editTool, deleteTool } from "../tools/ui";
import { showMCPMenu } from "../mcp/ui";
import { listModels, addModel, updateModel, deleteModel } from "../models/ui";
import { showSecretsList } from "../secrets/ui";
import { licenseState, setLicenseValid } from "../utils/licenseStatus";
import { api } from "../../cli-utils/api.js";
import fs from 'fs';


export const initCommands = () => {

    registerCommand('clear', async () => {
        try {
            console.log(clearChat);
            clearChat();
        } catch (error) {
            // process.exit(1);
            fs.writeFileSync('error.log', `Error clearing chat: ${error.message}\n`, { flag: 'a' });
            pushSystemMessage('Error clearing chat: ' + error.message);
        }
    })

    registerCommand('clearHistory', async () => {
        const choice = await showPrompt({
            message: 'Are you sure you want to clear chat history? This cannot be undone.',
            options: [
                { label: 'Yes, clear chat history', value: 'chat' },
                { label: 'No, cancel', value: 'cancel' }
            ]
        })

        clearChat();

        if (choice === 'chat' && current) {
            try {
                clearChat();
                await current.clearMessages();
                if (pushSystemMessage) {
                    pushSystemMessage('Chat history cleared.')
                }
            } catch (error) {
                if (pushSystemMessage) {
                    pushSystemMessage('Error clearing chat history: ' + error.message);
                }
            }
        }
    })

    registerCommand('reset', async () => {

        try {
            clearChat && clearChat()
        } catch (e) { }
        // clear terminal display
        try {
            process.stdout.write('\x1Bc')
        } catch (e) {
            console.clear()
        }

        await current?.reset();
    })

    registerCommand('help', async () => {

        const commands = [
            '/help           Show this help message',
            '/clear          Clears terminal chat display',
            '/clearHistory   resets chat message history (cannot be undone)',
            '/reset          Reset assistant memory and clear chat',
            '/logout         Logout and delete stored credentials',
            '/quit           Quit the CLI',
            '/mcp            Add/remove/list MCP servers',
            '/models         Manage AI models',
            '/license        Check/activate/deactivate license',
            '/permission     View/change CLI permission level',
        ];

        await showPrompt({
            message: `
Available commands:
└── ${commands.join('\n    ')}
            `,
            options: [
                { label: 'Back', value: 'back' }
            ]
        });
    })

    registerCommand('logout', async ()=> {
        // ttc.close();
        // delete stored credentials
        const choice = await showPrompt({
            message: 'Are you sure you want to logout? This will delete stored credentials.',
            options: [
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' }
            ]
        })

        if (choice === 'yes') {
            // await deleteCredentials();
            // if (pushSystemMessage) {
            //     pushSystemMessage('Logged out and deleted stored credentials. Please restart the application.')
            // } else {
            //     console.log('Logged out and deleted stored credentials. Please restart the application.')
            // }
            // ttc.close();
            process.exit();
        }
    })

    registerCommand('quit', async () => {
        const choice = await showPrompt({
            message: 'Are you sure you want to quit?',
            options: [
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' }
            ]
        })

        if (choice === 'yes') {
            process.exit();
        }
    })

    registerCommand('mcp', async () => {
        await showMCPMenu();
    })

    registerCommand('tools', async () => {
        const action = await showPrompt({
            message: 'Tools Management:',
            options: [
                { label: 'List Tools', value: 'list' },
                { label: 'Create New Tool', value: 'create' },
                { label: 'View Tool Details', value: 'view' },
                { label: 'Edit Tool', value: 'edit' },
                { label: 'Delete Tool', value: 'delete' },
                { label: 'Cancel', value: 'cancel' }
            ]
        });

        if (!action || action === 'cancel') {
            pushSystemMessage && pushSystemMessage('Tools management cancelled.');
            return;
        }

        try {
            switch (action) {
                case 'list':
                    await listTools();
                    break;
                case 'create':
                    await createTool();
                    break;
                case 'view':
                    await viewTool();
                    break;
                case 'edit':
                    await editTool();
                    break;
                case 'delete':
                    await deleteTool();
                    break;
            }
        } catch (error) {
            pushSystemMessage && pushSystemMessage(`Error in tools management: ${error.message}`);
        }
    })


    registerCommand('secrets', async () => {
        await showSecretsList();
    })

    registerCommand('models', async ()=> {
        const action = await showPrompt({
            message: 'Models Management:',
            type: 'select',
            options: [
                { label: 'Select Model', value: 'list' },
                { label: 'Add Custom Model', value: 'add' },
                { label: 'Update Model', value: 'update' },
                { label: 'Delete Model', value: 'delete' },
                { label: 'Cancel', value: 'cancel' }
            ]
        });

        if (!action || action === 'cancel') {
            pushSystemMessage && pushSystemMessage('Models management cancelled.');
            return;
        }

        try {
            switch (action) {
                case 'list':
                    await listModels();
                    break;
                case 'add':
                    await addModel();
                    break;
                case 'update':
                    await updateModel();
                    break;
                case 'delete':
                    await deleteModel();
                    break;
            }
        } catch (error) {
            console.error('Error in models management:', error);
            pushSystemMessage && pushSystemMessage('Error in models management.');
        }
    })

    // registerCommand('permission', async () => {
    //     const currentLevel = current.id ? await getCliPermissionLevel(current.actionClient.id) : 'dynamic';
        
    //     const action = await showPrompt({
    //         message: `Current CLI Permission Level: ${currentLevel.toUpperCase()}\n\nSelect new permission level:`,
    //         type: 'select',
    //         options: [
    //             { label: 'ASK - Always ask before executing commands', value: 'ask' },
    //             { label: 'DYNAMIC - Only ask for dangerous commands (default)', value: 'dynamic' },
    //             { label: 'ALLOW - Always allow commands without asking', value: 'allow' },
    //             { label: 'Cancel', value: 'cancel' }
    //         ]
    //     });

    //     if (!action || action === 'cancel') {
    //         pushSystemMessage && pushSystemMessage('Permission level unchanged.');
    //         return;
    //     }

    //     // Confirmation with critical warning for ALLOW permission
    //     if (action === 'allow') {
    //         const confirm = await showPrompt({
    //             message: '⚠️  CRITICAL WARNING: ALLOW permission means the AI will execute ALL commands without asking.\n\n' +
    //                 'This includes file deletion, system modifications, network access, and any other command.\n' +
    //                 'Only use this if you fully trust the AI and understand the risks.\n\n' +
    //                 'Are you absolutely sure you want to enable ALLOW permission?',
    //             type: 'select',
    //             options: [
    //                 { label: 'Yes, enable ALLOW permission', value: 'yes' },
    //                 { label: 'No, go back', value: 'no' }
    //             ]
    //         });

    //         if (confirm !== 'yes') {
    //             pushSystemMessage && pushSystemMessage('Permission level unchanged.');
    //             return;
    //         }
    //     }

    //     // General confirmation for any permission change
    //     const actionLabel = action === 'allow' ? 'ALLOW (all commands auto-approved)' : action.toUpperCase();
    //     const generalConfirm = await showPrompt({
    //         message: `Set permission level to ${actionLabel}?`,
    //         type: 'select',
    //         options: [
    //             { label: 'Yes', value: 'yes' },
    //             { label: 'No, cancel', value: 'no' }
    //         ]
    //     });

    //     if (generalConfirm !== 'yes') {
    //         pushSystemMessage && pushSystemMessage('Permission level unchanged.');
    //         return;
    //     }

    //     if (current.id) {
    //         const success = await setCliPermissionLevel(current.actionClient.id, action as any);
    //         if (success) {
    //             pushSystemMessage && pushSystemMessage(`CLI Permission level set to: ${action.toUpperCase()}`);
    //         } else {
    //             pushSystemMessage && pushSystemMessage('Failed to update permission level. Agent not found.');
    //         }
    //     } else {
    //         pushSystemMessage && pushSystemMessage('No active agent. Please connect to an agent first.');
    //     }
    // })

    registerCommand('workspace', async () => {
        const path = await showPrompt({
            message: 'Enter workspace path (current: ' + process.cwd() + '):',
            type: 'text'
        });

        if (!path || path === 'cancel') {
            pushSystemMessage && pushSystemMessage('Workspace change cancelled.');
            return;
        }

        try {
            process.chdir(path);
            const cwd = process.cwd();
            pushSystemMessage && pushSystemMessage(`Workspace changed to: ${cwd}`);
        } catch (error) {
            pushSystemMessage && pushSystemMessage(`Failed to change workspace: ${error.message}`);
        }
    })

    registerCommand('license', async () => {
        const action = await showPrompt({
            message: `License status: ${licenseState.valid ? '✅ Active' : 'Not activated'}`,
            options: [
                { label: 'Check status', value: 'status' },
                { label: 'Activate license', value: 'activate' },
                { label: 'Deactivate license', value: 'deactivate' },
                { label: 'Cancel', value: 'cancel' }
            ]
        });

        if (!action || action === 'cancel') return;

        try {
            if (action === 'status') {
                const res: any = await api.GneolServer.license('status', { key: '' });
                const valid = typeof res === 'string' ? res.toLowerCase().includes('active') : !!res?.valid;
                setLicenseValid(valid);
                pushSystemMessage && pushSystemMessage(typeof res === 'string' ? res : (res?.message || 'License status retrieved.'));
                return;
            }

            if (action === 'activate') {
                const licenseKey = await showPrompt({
                    message: 'Enter Gneol License key:',
                    type: 'text'
                });

                if (!licenseKey || licenseKey === 'cancel') {
                    pushSystemMessage && pushSystemMessage('Activation cancelled.');
                    return;
                }

                const res: any = await api.GneolServer.license('activate', { key: licenseKey });
                if (res?.success) {
                    setLicenseValid(true);
                    pushSystemMessage && pushSystemMessage('✅ License activated successfully! You can now create multiple agents.');
                } else {
                    pushSystemMessage && pushSystemMessage('❌ License activation failed: ' + (res?.message || 'Unknown error'));
                }
                return;
            }

            if (action === 'deactivate') {
                const confirm = await showPrompt({
                    message: 'Are you sure you want to deactivate your license?',
                    options: [
                        { label: 'Yes, deactivate', value: 'yes' },
                        { label: 'No, cancel', value: 'no' }
                    ]
                });

                if (confirm !== 'yes') {
                    pushSystemMessage && pushSystemMessage('Deactivation cancelled.');
                    return;
                }

                const res: any = await api.GneolServer.license('deactivate', { key: '' });
                if (res?.success) {
                    setLicenseValid(false);
                    pushSystemMessage && pushSystemMessage('License deactivated.');
                } else {
                    setLicenseValid(false);
                    pushSystemMessage && pushSystemMessage('⚠️ ' + (res?.message || 'Deactivation failed.'));
                }
            }
        } catch (error: any) {
            pushSystemMessage && pushSystemMessage('License operation failed: ' + (error?.message || error));
        }
    })

}