const { Module, z } = require("gneol-sdk");

const mod = new Module('CustomTool');

mod.tool({
    name: 'greet',
    description: 'Greets a person by name with a friendly message.',
    parameters: z.object({
        name: z.string().describe("The person's name to greet")
    }),
    output: z.string(),
    func: async (args) => {
        return `Hello, ${args.name}! Welcome to the Gneol tool system.`;
    },
    action: (input) => {
        return `Greeted ${input.name}`;
    },
    auth: async (authData) => {
        return true;
    }
});

mod.tool({
    name: 'farewell',
    description: 'Bids farewell to a person with a custom message.',
    parameters: z.object({
        name: z.string().describe("The person's name"),
        message: z.string().optional().describe("Optional custom farewell message").default("Goodbye")
    }),
    output: z.string(),
    func: async (args) => {
        return `${args.message}, ${args.name}! See you next time.`;
    },
    action: (input) => {
        return `Farewell to ${input.name}`;
    },
    auth: async (authData) => {
        return true;
    }
});

mod.tool({
    name: 'testFunction',
    description: 'Validates a secret token.',
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
    action: (input) => {
        return 'Testing function'
    },
    auth: async (authData) => {
        return 'Allow this function execute?'
    }
});

mod.tool({
    name: 'calculate',
    description: 'Performs basic arithmetic (add, subtract, multiply, divide).',
    parameters: z.object({
        a: z.number(),
        b: z.number(),
        operation: z.enum(['add', 'subtract', 'multiply', 'divide'])
    }),
    output: z.number(),
    func: async (args) => {
        switch (args.operation) {
            case 'add': return args.a + args.b;
            case 'subtract': return args.a - args.b;
            case 'multiply': return args.a * args.b;
            case 'divide': return args.a / args.b;
            default: throw new Error('Invalid operation');
        }
    },
    action: (input) => {
        return `Calculated ${input.a} ${input.operation} ${input.b}`;
    },
    auth: async () => true
});

mod.parse();

