import { connectToServer, toolExecutor } from './tool-executor';

// Get DOM elements
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const executeButton = document.getElementById('executeButton') as HTMLButtonElement;
const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
const serverIdInput = document.getElementById('serverId') as HTMLInputElement;
const toolNameInput = document.getElementById('toolName') as HTMLInputElement;
const toolArgsInput = document.getElementById('toolArgs') as HTMLTextAreaElement;
const connectionStatus = document.getElementById('connectionStatus') as HTMLDivElement;
const toolResult = document.getElementById('toolResult') as HTMLDivElement;
const formatJsonButton = document.getElementById('formatJsonButton') as HTMLButtonElement;
const clearJsonButton = document.getElementById('clearJsonButton') as HTMLButtonElement;

let isConnected = false;

// Format JSON function
const formatJSON = (json: string): string => {
    try {
        const parsed = JSON.parse(json);
        return JSON.stringify(parsed, null, 2);
    } catch (error) {
        throw new Error('Invalid JSON format');
    }
};

// Format JSON button handler
formatJsonButton.addEventListener('click', () => {
    try {
        const formatted = formatJSON(toolArgsInput.value);
        toolArgsInput.value = formatted;
        toolResult.textContent = '';
        toolResult.className = 'json-result';
    } catch (error) {
        toolResult.textContent = `Error: ${error instanceof Error ? error.message : 'Invalid JSON format'}`;
        toolResult.className = 'json-result json-error';
    }
});

// Clear JSON button handler
clearJsonButton.addEventListener('click', () => {
    toolArgsInput.value = '';
    toolResult.textContent = '';
    toolResult.className = 'json-result';
});

// Connect button handler
connectButton.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value;
    const serverId = serverIdInput.value;

    try {
        await connectToServer(serverId, serverUrl, {
            onToolsReceived: (serverId, tools) => {
                console.log('Received tools:', tools);
            }
        });
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status connected';
        executeButton.disabled = false;
        isConnected = true;
    } catch (error) {
        connectionStatus.textContent = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        connectionStatus.className = 'status disconnected';
        executeButton.disabled = true;
        isConnected = false;
    }
});

// Execute tool button handler
executeButton.addEventListener('click', async () => {
    const serverId = serverIdInput.value;
    const toolName = toolNameInput.value;
    const toolArgsStr = toolArgsInput.value;

    try {
        // Format the input JSON before parsing
        const formattedArgs = formatJSON(toolArgsStr);
        toolArgsInput.value = formattedArgs;
        
        const args = JSON.parse(formattedArgs);
        const result = await toolExecutor.executeTool(serverId, toolName, args);
        
        // Format the result JSON
        const formattedResult = formatJSON(result);
        toolResult.textContent = formattedResult;
        toolResult.className = 'json-result json-success';
    } catch (error) {
        toolResult.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        toolResult.className = 'json-result json-error';
    }
}); 