// Store reply count and contents in local storage
let replyCount = parseInt(localStorage.getItem('replyCount') || '0');
let replyContents = JSON.parse(localStorage.getItem('replyContents') || '[]');
let MAX_REPLIES = 25; // Default value

// Load MAX_REPLIES from storage on startup
chrome.storage.local.get(['maxReplies'], (result) => {
    if (result.maxReplies) {
        MAX_REPLIES = result.maxReplies;
        updateCounterUI(); // Update UI with new max value
    }
});

// Add message listener for popup communications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_MAX_REPLIES') {
        MAX_REPLIES = message.value;
        updateCounterUI();
    } else if (message.type === 'RESET_COUNTER') {
        localStorage.removeItem('replyCount');
        localStorage.removeItem('replyContents');
        replyCount = 0;
        replyContents = [];
        updateCounterUI();
    }
});

// We could track only replies and not deletions
// However that wouldnt be useful, so we need to store the replies in order to match up with what the
// user is deleting and then if it matches up then we delete from local storage and decrement the counter



// Function to create and inject our custom UI
function createCustomUI() {
    const customUI = document.createElement('div');
    customUI.className = 'custom-twitter-ui';

    // Calculate progress percentage
    const progress = Math.min((replyCount / MAX_REPLIES) * 100, 100);

    customUI.innerHTML = `
        <div class="reply-counter ${replyCount >= MAX_REPLIES ? 'max-reached' : ''}">
            <span>${replyCount}/${MAX_REPLIES}</span>
            <div class="progress-bar" style="width: ${progress}%"></div>
        </div>
    `;

    return customUI;
}

// Function to update the counter UI
function updateCounterUI() {
    const counters = document.querySelectorAll('.reply-counter');
    counters.forEach(counter => {
        const span = counter.querySelector('span');
        const progressBar = counter.querySelector('.progress-bar');

        // Update counter text
        span.textContent = `${replyCount}/${MAX_REPLIES}`;

        // Update progress bar
        const progress = Math.min((replyCount / MAX_REPLIES) * 100, 100);
        progressBar.style.width = `${progress}%`;

        // Update max-reached class
        counter.classList.toggle('max-reached', replyCount >= MAX_REPLIES);
    });
}

// Function to inject our UI into a specific container
function injectUIIntoContainer(container) {
    if (!container || container.querySelector('.custom-twitter-ui')) return;
    const customUI = createCustomUI();
    container.appendChild(customUI);
}

// Function to track successful replies with content
function trackSuccessfulReply() {
    // Try to get the reply content from the last known textarea content
    const replyContent = window.lastReplyContent || '';
    console.log('Tracking reply with content:', replyContent);

    if (!replyContent.trim()) {
        console.log('No reply content found, but still tracking the reply');
        // Continue tracking even without content since we know a reply was made
    }

    // Add to storage with timestamp to help with matching later
    replyCount = Math.min(replyCount + 1, MAX_REPLIES);
    replyContents.push({
        content: replyContent,
        timestamp: Date.now()
    });

    // Clear the last reply content
    window.lastReplyContent = null;

    // Update local storage
    localStorage.setItem('replyCount', replyCount.toString());
    localStorage.setItem('replyContents', JSON.stringify(replyContents));

    updateCounterUI();
    console.log('Reply tracked! New count:', replyCount);

    // Reset deletion watcher and set it up again immediately after reply
    window.deletionWatcherInitialized = false;
    setTimeout(() => {
        if (!window.deletionWatcherInitialized) {
            watchForDeletions();
            window.deletionWatcherInitialized = true;
            console.log('Deletion watcher reinitialized after reply');
        }
    }, 20);
}

// Function to handle reply deletion
function handleReplyDeletion(deletedContent) {
    console.log('Attempting to handle deletion for content:', deletedContent);
    console.log('Current reply contents:', replyContents);

    // Find the matching reply content
    const index = replyContents.findIndex(reply => {
        const match = reply.content.includes(deletedContent) || deletedContent.includes(reply.content);
        console.log('Checking content:', reply.content, 'Match:', match);
        return match;
    });

    if (index !== -1) {
        console.log('Found matching reply at index:', index);

        // Remove the content and decrement counter
        replyContents.splice(index, 1);
        replyCount = Math.max(0, replyCount - 1);

        // Update local storage
        localStorage.setItem('replyCount', replyCount.toString());
        localStorage.setItem('replyContents', JSON.stringify(replyContents));

        updateCounterUI();
        console.log('Reply removed! New count:', replyCount);
        console.log('Updated reply contents:', replyContents);
    } else {
        console.log('No matching reply found for deletion');
    }
}

// Function to watch for tweet deletions
function watchForDeletions() {
    console.log('Setting up deletion watcher...');

    // Watch for menu items being added to the DOM
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {  // Element node
                    // Check for delete menu item
                    const menuItems = node.querySelectorAll('[role="menuitem"]');
                    menuItems.forEach(item => {
                        if (item.textContent.includes('Delete')) {
                            console.log('found a delete menu item');
                            item.addEventListener('click', () => {
                                console.log('first delete menu item clicked');
                                if (window.pendingTweetContainer) {
                                    const tweetText = window.pendingTweetContainer.querySelector('[data-testid="tweetText"]');
                                    if (tweetText) {
                                        window.pendingDeleteContent = tweetText.textContent;
                                        console.log('Stored tweet content for deletion:', window.pendingDeleteContent);
                                    }
                                }
                            });
                        }
                    });

                    // Check for confirmation button being added
                    const confirmButton = node.querySelector('[data-testid="confirmationSheetConfirm"]');
                    if (confirmButton) {
                        console.log('Found confirmation button, adding click listener');
                        confirmButton.addEventListener('click', () => {
                            console.log('Confirmation button clicked directly');
                            if (window.pendingDeleteContent) {
                                handleReplyDeletion(window.pendingDeleteContent);
                                window.pendingDeleteContent = null;
                                window.pendingTweetContainer = null;
                            }
                        });
                    }
                }
            }
        }
    });

    // Start observing the entire document for menu additions
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Watch for all clicks at the document level
    document.addEventListener('click', (e) => {
        // Check for More menu button
        const menuButton = e.target.closest('[aria-label="More"]');
        if (menuButton) {
            const tweetContainer = menuButton.closest('article');
            if (tweetContainer) {
                window.pendingTweetContainer = tweetContainer;
            }
        }

        // Check for confirmation button click by looking at the event target and its parents
        let element = e.target;
        while (element) {
            if (element.getAttribute('data-testid') === 'confirmationSheetConfirm') {
                console.log('Confirmation button clicked through event bubbling');
                if (window.pendingDeleteContent) {
                    handleReplyDeletion(window.pendingDeleteContent);
                    window.pendingDeleteContent = null;
                    window.pendingTweetContainer = null;
                }
                break;
            }
            element = element.parentElement;
        }
    }, true); // Use capture phase to catch events before they might be stopped
}

// Function to watch tweet button state changes
function watchTweetButton(tweetButton) {
    if (!tweetButton || tweetButton.dataset.watcherAdded) return;

    console.log('Setting up tweet button watcher');
    tweetButton.dataset.watcherAdded = 'true';

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
                const wasEnabled = !mutation.oldValue;
                const isDisabled = tweetButton.disabled;

                console.log('Tweet button state changed:', { wasEnabled, isDisabled });

                if (wasEnabled && isDisabled) {
                    console.log('Tweet button was clicked and disabled');
                    setTimeout(() => {
                        if (tweetButton.disabled) {
                            // Find the closest textarea to get content
                            let content = '';
                            const container = tweetButton.closest('[role="group"]') || tweetButton.closest('form');
                            const textarea = container?.querySelector('[data-testid="tweetTextarea_0"]');
                            if (textarea) {
                                content = textarea.textContent || '';
                            }

                            // Increment counter and store content
                            replyCount = Math.min(replyCount + 1, MAX_REPLIES);
                            replyContents.push({
                                content: content,
                                timestamp: Date.now()
                            });

                            // Update local storage
                            localStorage.setItem('replyCount', replyCount.toString());
                            localStorage.setItem('replyContents', JSON.stringify(replyContents));

                            updateCounterUI();
                            console.log('Reply tracked! New count:', replyCount);
                            console.log('Stored content:', content);
                        }
                    }, 1000);
                }
            }
        });
    });

    observer.observe(tweetButton, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['disabled']
    });
}

// Function to find and watch tweet buttons
function findAndWatchTweetButtons() {
    // Watch both inline and modal tweet buttons
    const tweetButtons = document.querySelectorAll([
        '[data-testid="tweetButtonInline"]',
        '[data-testid="tweetButton"]'
    ].join(','));

    console.log('Found tweet buttons:', tweetButtons.length);
    tweetButtons.forEach(watchTweetButton);
}

// Update handleDOMChanges to watch for inline reply fields
function handleDOMChanges(mutations) {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;

            // Watch for any tweet buttons (both inline and modal)
            const tweetButtons = node.querySelectorAll([
                '[data-testid="tweetButtonInline"]',
                '[data-testid="tweetButton"]'
            ].join(','));

            tweetButtons.forEach(watchTweetButton);

            // Check for UI containers
            const containers = [
                ...(node.matches('.css-175oi2r.r-e7q0ms.r-12kyg2d') ? [node] : []),
                ...node.querySelectorAll('.css-175oi2r.r-e7q0ms.r-12kyg2d')
            ];
            containers.forEach(injectUIIntoContainer);
        }
    }
}

// Function to initialize all watchers and UI
function initialize() {
    console.log('Initializing...');

    // Initial UI injection and button watchers setup
    setTimeout(() => {
        const containers = document.querySelectorAll('.css-175oi2r.r-e7q0ms.r-12kyg2d');
        console.log('Found initial containers:', containers.length);
        containers.forEach(injectUIIntoContainer);

        findAndWatchTweetButtons();

        // Make sure deletion watcher is set up
        if (!window.deletionWatcherInitialized) {
            watchForDeletions();
            window.deletionWatcherInitialized = true;
            console.log('Deletion watcher initialized');
        }
    }, 1000);

    // Set up observer for dynamic content
    const observer = new MutationObserver(handleDOMChanges);

    const mainContent = document.querySelector('main');
    if (mainContent) {
        console.log('Started observing main content');
        observer.observe(mainContent, {
            childList: true,
            subtree: true
        });
    } else {
        console.log('Could not find main content to observe');
    }
}

// Handle Twitter's SPA navigation
let lastUrl = location.href;
const navigationObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('URL changed, reinitializing...');

        // Reset deletion watcher flag on navigation
        window.deletionWatcherInitialized = false;

        // Reinitialize everything
        initialize();
    }
});

// Start observing for navigation changes
navigationObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - initializing...');
    initialize();
});

window.addEventListener('load', () => {
    console.log('Window Loaded - initializing...');
    initialize();
});
