// Permission System Documentation for Agents
// Agents should read this before interacting with files.

export const PermissionInfo = `
File Permission System
=====================

All file operations are governed by a metadata.
Each file has:
  - owner: the agent who created the file (or first performed a write operation)
  - editors: list of agent IDs authorized to edit

Rules:
1. Creating a file automatically sets the creator as owner and adds them to editors.
2. Editing a file that has NO existing metadata record will create one with
   the editing agent as owner (first writer gets ownership).
3. Before interacting with any file you have not touched before, ALWAYS call
   File.stats({ filePath }) to check the 'owner' and 'editors' fields.
   - If you are the owner, you can do anything.
   - If you are listed in editors, you can edit.
   - If not, you will be blocked unless the owner authorizes you.
4. To grant access, the owner calls File.authorize({ filePath, agentId }).
5. File.writeLog and File.readLogs allow cooperative note-taking on files.
   Logs are visible to any agent with file access.
6. Only the owner can revoke authorization.

Always check stats first. Never assume ownership.
`;
