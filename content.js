// Store reply count in local storage
let replyCount = parseInt(localStorage.getItem('replyCount') || '0');
const MAX_REPLIES = 25;

// Function to create and inject our custom UI
function createCustomUI() {
    const customUI = document.createElement('div');
    customUI.className = 'custom-twitter-ui';
    customUI.innerHTML = `
        <div class="reply-counter ${replyCount >= MAX_REPLIES ? 'max-reached' : ''}">
            <span>${replyCount}/${MAX_REPLIES}</span>
        </div>
    `;
    return customUI;
}

// Function to update the counter UI
function updateCounterUI() {
    const counters = document.querySelectorAll('.reply-counter span');
    counters.forEach(counter => {
        counter.textContent = `${replyCount}/${MAX_REPLIES}`;
        const counterDiv = counter.closest('.reply-counter');
        if (counterDiv) {
            counterDiv.classList.toggle('max-reached', replyCount >= MAX_REPLIES);
        }
    });
}

// Function to inject our UI into a specific container
function injectUIIntoContainer(container) {
    if (!container || container.querySelector('.custom-twitter-ui')) return;
    const customUI = createCustomUI();
    container.appendChild(customUI);
}

// Function to track successful replies
function trackSuccessfulReply() {
    replyCount = Math.min(replyCount + 1, MAX_REPLIES);
    localStorage.setItem('replyCount', replyCount.toString());
    updateCounterUI();
    console.log('Reply tracked! New count:', replyCount);
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

                // If button was enabled and is now disabled, it might have been clicked
                if (wasEnabled && isDisabled) {
                    console.log('Tweet button was clicked and disabled');
                    setTimeout(() => {
                        // Only track if button is still disabled (tweet went through)
                        if (tweetButton.disabled) {
                            console.log('Tracking reply...');
                            trackSuccessfulReply();
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
    const tweetButtons = document.querySelectorAll('[data-testid="tweetButtonInline"]');
    console.log('Found tweet buttons:', tweetButtons.length);
    tweetButtons.forEach(watchTweetButton);
}

// Combined function to handle both UI injection and button watching
function handleDOMChanges(mutations) {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;

            // Watch for new tweet buttons
            const tweetButton = node.querySelector('[data-testid="tweetButtonInline"]');
            if (tweetButton) {
                watchTweetButton(tweetButton);
            }

            // Check for UI containers
            const containers = [
                ...(node.matches('.css-175oi2r.r-e7q0ms.r-12kyg2d') ? [node] : []),
                ...node.querySelectorAll('.css-175oi2r.r-e7q0ms.r-12kyg2d')
            ];
            containers.forEach(injectUIIntoContainer);
        }
    }
}

// Initialize
function initialize() {
    console.log('Initializing...');

    // Initial UI injection
    setTimeout(() => {
        const containers = document.querySelectorAll('.css-175oi2r.r-e7q0ms.r-12kyg2d');
        console.log('Found initial containers:', containers.length);
        containers.forEach(injectUIIntoContainer);

        // Set up initial tweet button watchers
        findAndWatchTweetButtons();
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

// Run on page load
document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('load', initialize);

// Handle Twitter's SPA navigation
let lastUrl = location.href;
const navigationObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        initialize();
    }
});

navigationObserver.observe(document.body, {
    childList: true,
    subtree: true
});
