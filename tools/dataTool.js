import { Module } from "gneol-sdk";
const mod = new Module("DataTool");
mod.tool({
    name: "fetchData",
    description: "Fetches data from a URL",
    parameters: '{ url: string }',
    output: '{ data: string }',
    func: async (args) => ({ success: true, data: "mock" }),
    action: async (args) => { console.log("DataTool used"); },
});
mod.parse();
