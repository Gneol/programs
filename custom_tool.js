const { Module, z } = require("gneol-sdk");

const mod = new Module('CustomTool');

mod.tool({
    name: 'testFunction',
    description: 'A test function for demonstration purposes.',
    parameters: z.object({
        token: z.string()
    }),
    output: z.boolean(),
    func: async (args) => {
        console.log(args, 'called oh')
        if (args.token === 'secretToken') {
            return true;
        }
        return false;
    },
    auth: async (authData) => {
        // return authData.token === 'secretToken';
        return 'Allow this function execute?'
    }
});

mod.parse();
