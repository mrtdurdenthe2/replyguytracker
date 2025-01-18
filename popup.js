document.addEventListener('DOMContentLoaded', () => {
    // Load current max replies setting
    chrome.storage.local.get(['maxReplies'], (result) => {
        const maxReplies = result.maxReplies || 25; // Default to 25 if not set
        document.getElementById('maxReplies').value = maxReplies;
    });

    // Save button handler
    document.getElementById('saveButton').addEventListener('click', () => {
        const maxReplies = parseInt(document.getElementById('maxReplies').value);
        if (maxReplies > 0) {
            chrome.storage.local.set({ maxReplies }, () => {
                // Send message to content script to update MAX_REPLIES
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'UPDATE_MAX_REPLIES',
                        value: maxReplies
                    });
                });
            });
        }
    });

    // Reset button handler with confirmation
    document.getElementById('resetButton').addEventListener('click', () => {
        const confirmDialog = document.getElementById('confirmDialog');
        confirmDialog.showModal();
    });

    // Confirm reset handler
    document.getElementById('confirmReset').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_COUNTER' });
        });
        document.getElementById('confirmDialog').close();
    });

    // Cancel reset handler
    document.getElementById('cancelReset').addEventListener('click', () => {
        document.getElementById('confirmDialog').close();
    });
});
