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

interface SavedTool {
    id: string;
    name: string;
    args: string;
    serverUrl: string;
    serverId: string;
    timestamp: number;
}

class ToolExecutor {
    private savedTools: SavedTool[] = [];
    private ws: WebSocket | null = null;
    private isConnected = false;

    constructor() {
        this.loadSavedData();
        this.initializeEventListeners();
        this.renderSavedTools();
    }

    private loadSavedData() {
        const savedTools = localStorage.getItem('savedTools');
        if (savedTools) {
            this.savedTools = JSON.parse(savedTools);
        }
    }

    private saveData() {
        localStorage.setItem('savedTools', JSON.stringify(this.savedTools));
    }

    private initializeEventListeners() {
        // Connect button
        const connectButton = document.getElementById('connectButton');
        if (connectButton) {
            connectButton.addEventListener('click', () => this.connect());
        }

        // Save button
        const saveButton = document.getElementById('saveToolButton');
        if (saveButton) {
            saveButton.addEventListener('click', () => this.saveTool());
        }

        // Format JSON button
        const formatJsonButton = document.getElementById('formatJsonButton');
        if (formatJsonButton) {
            formatJsonButton.addEventListener('click', () => this.formatJson());
        }

        // Clear JSON button
        const clearJsonButton = document.getElementById('clearJsonButton');
        if (clearJsonButton) {
            clearJsonButton.addEventListener('click', () => this.clearJson());
        }

        // Execute button
        const executeButton = document.getElementById('executeButton');
        if (executeButton) {
            executeButton.addEventListener('click', () => this.executeTool());
        }
    }

    private connect() {
        const serverUrl = (document.getElementById('serverUrl') as HTMLInputElement).value;
        const serverId = (document.getElementById('serverId') as HTMLInputElement).value;

        try {
            this.ws = new WebSocket(serverUrl);
            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus(true);
                (document.getElementById('executeButton') as HTMLButtonElement).disabled = false;
            };
            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus(false);
                (document.getElementById('executeButton') as HTMLButtonElement).disabled = true;
            };
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus(false);
            };
            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };
        } catch (error) {
            console.error('Connection error:', error);
            this.updateConnectionStatus(false);
        }
    }

    private updateConnectionStatus(connected: boolean) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = connected ? 'Connected' : 'Disconnected';
            statusElement.className = `status ${connected ? 'connected' : 'disconnected'}`;
        }
    }

    private saveTool() {
        const toolName = (document.getElementById('toolName') as HTMLInputElement).value;
        const toolArgs = (document.getElementById('toolArgs') as HTMLTextAreaElement).value;
        const serverUrl = (document.getElementById('serverUrl') as HTMLInputElement).value;
        const serverId = (document.getElementById('serverId') as HTMLInputElement).value;

        if (!toolName) {
            alert('Please enter a tool name');
            return;
        }

        if (!serverUrl || !serverId) {
            alert('Please enter server URL and ID');
            return;
        }

        try {
            // Validate JSON
            JSON.parse(toolArgs);

            const tool: SavedTool = {
                id: crypto.randomUUID(),
                name: toolName,
                args: toolArgs,
                serverUrl,
                serverId,
                timestamp: Date.now()
            };

            this.savedTools.push(tool);
            this.saveData();
            this.renderSavedTools();
        } catch (error) {
            alert('Invalid JSON format');
        }
    }

    private renderSavedTools() {
        const savedToolsList = document.getElementById('savedToolsList');
        if (!savedToolsList) return;

        savedToolsList.innerHTML = this.savedTools
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(tool => `
                <div class="saved-tool-item" data-id="${tool.id}">
                    <div class="tool-info">
                        <strong>${tool.name}</strong>
                        <div class="tool-args">${tool.args.substring(0, 50)}${tool.args.length > 50 ? '...' : ''}</div>
                        <div class="tool-server">Server: ${tool.serverId}</div>
                    </div>
                    <div class="saved-tool-actions">
                        <button class="icon-button load-tool" title="Load Tool">↩️</button>
                        <button class="icon-button delete-tool" title="Delete Tool">🗑️</button>
                    </div>
                </div>
            `)
            .join('');

        // Add event listeners for the buttons
        savedToolsList.querySelectorAll('.load-tool').forEach(button => {
            button.addEventListener('click', (e) => {
                const toolItem = (e.target as HTMLElement).closest('.saved-tool-item');
                if (toolItem) {
                    const toolId = toolItem.getAttribute('data-id');
                    this.loadTool(toolId!);
                }
            });
        });

        savedToolsList.querySelectorAll('.delete-tool').forEach(button => {
            button.addEventListener('click', (e) => {
                const toolItem = (e.target as HTMLElement).closest('.saved-tool-item');
                if (toolItem) {
                    const toolId = toolItem.getAttribute('data-id');
                    this.deleteTool(toolId!);
                }
            });
        });
    }

    private loadTool(toolId: string) {
        const tool = this.savedTools.find(t => t.id === toolId);
        if (tool) {
            (document.getElementById('toolName') as HTMLInputElement).value = tool.name;
            (document.getElementById('toolArgs') as HTMLTextAreaElement).value = tool.args;
            (document.getElementById('serverUrl') as HTMLInputElement).value = tool.serverUrl;
            (document.getElementById('serverId') as HTMLInputElement).value = tool.serverId;
        }
    }

    private deleteTool(toolId: string) {
        this.savedTools = this.savedTools.filter(t => t.id !== toolId);
        this.saveData();
        this.renderSavedTools();
    }

    private formatJson() {
        const toolArgs = (document.getElementById('toolArgs') as HTMLTextAreaElement);
        try {
            const parsed = JSON.parse(toolArgs.value);
            toolArgs.value = JSON.stringify(parsed, null, 2);
        } catch (error) {
            alert('Invalid JSON format');
        }
    }

    private clearJson() {
        (document.getElementById('toolArgs') as HTMLTextAreaElement).value = '';
    }

    private executeTool() {
        if (!this.isConnected || !this.ws) {
            alert('Not connected to server');
            return;
        }

        const toolName = (document.getElementById('toolName') as HTMLInputElement).value;
        const toolArgs = (document.getElementById('toolArgs') as HTMLTextAreaElement).value;

        try {
            const args = JSON.parse(toolArgs);
            const message = {
                type: 'execute',
                tool: toolName,
                args
            };

            this.ws.send(JSON.stringify(message));
        } catch (error) {
            alert('Invalid JSON format');
        }
    }

    private handleMessage(data: string) {
        try {
            const result = JSON.parse(data);
            const resultElement = document.getElementById('toolResult');
            if (resultElement) {
                resultElement.textContent = JSON.stringify(result, null, 2);
                resultElement.className = 'json-result json-success';
            }
        } catch (error) {
            const resultElement = document.getElementById('toolResult');
            if (resultElement) {
                resultElement.textContent = data;
                resultElement.className = 'json-result json-error';
            }
        }
    }
}

// Initialize the application
new ToolExecutor(); 