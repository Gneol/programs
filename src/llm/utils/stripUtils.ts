import { f_call, f_response, llm_message_internal } from "./types";







const cleanUpContent = (role: 'user' | 'assistant', content: string) => {
    if (role === 'assistant') {
        return JSON.parse(content)
    }

    try {
        return JSON.parse(content);
    } catch (error) {
        return content;
    }
}

const eligible_keep = (contents: f_call[]): boolean => {

    const response = contents.find(x => x.function?.startsWith('TTCInternal'));

    if (response) {
        return true;
    }

    return false;
    // find out if there are other functions apart from speakToUser
}

const getStopIndex = (messages: llm_message_internal[]) => {
    let count_occurrences: number = 0;
    let index = 0;
    // get stopindex
    for (let j = messages.length - 1; j > 0; j--) {
        const element = messages[j];
        if (element.role === 'assistant') {
            const content: f_call[] = cleanUpContent('assistant', element.content);
            if (eligible_keep(content)) {
                count_occurrences++;
            }
            // check if it has other functions apart from any internal call
        } else {
            // user content
            const content: f_response[] | string = cleanUpContent('user', element.content)

            if (typeof content === 'object') {
                // if the content is a function response
                count_occurrences++;
            }
        }

        if (count_occurrences === 16) {
            index = j;
            break;
        }
    }

    return index;
}


export const stripFunctionCalls = async (data: {
    messages: llm_message_internal[]
    _scid: string
}) => {

    // we strip from the bottom
    // calculate end index in case of count overlap

    try {
        // const id = data.assistant_id;
        let messages = data.messages;
        const stop_index: number = getStopIndex(messages);
        console.log('stripping', messages.length, 'messages');
        let totalMessages = messages.length;
        if (stop_index === 0) {
            return;
        }
        // we strip
        for (let j = 0; j < messages.length; j++) {
            const element = messages[j];

            if (j === stop_index) {
                break;
            }

            if (element.role === 'assistant') {
                const content: f_call[] = cleanUpContent('assistant', element.content);
                const filtered_content = content.filter(x => x.function?.startsWith('TTCInternal'))
                if (filtered_content.length > 0) {
                    messages[j] = {
                        role: 'assistant',
                        content: JSON.stringify(filtered_content)
                    }
                } else {
                    messages[j] = null as any;
                }
                // we remo
            } else {
                // user content
                const content: f_response[] | string = cleanUpContent('user', element.content)

                if (typeof content === 'object') {
                    messages[j] = null as any;
                }
            }
        }
        messages = messages.filter(x => x);
        // save messages
        // Stream.publish_event('llm', data._scid, data.assistant_id, {
        //     type: 'action_log',
        //     state: `stripped, ${totalMessages - messages.length} messages`
        // })
        console.log(`stripped, ${totalMessages - messages.length} messages`, 'remaining', messages.length)

        return messages;

    } catch (error) {
        console.log(error);
    }
}

// const fs = require('fs');
// const file = JSON.parse(fs.readFileSync('test.json', 'utf8'));
// stripFunctionCalls({
//     assistant_id: '',
//     _scid: '',
//     messages: file
// }).then(r => console.log(r.length))