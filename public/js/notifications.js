/**
 * Notification manager for the Work Time Tracker application.
 * Manages the display of notifications to the user.
 * Provides methods for showing and dismissing notifications.
 */

class NotificationManager {
  constructor() {
    this.container = document.getElementById("notification-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "notification-container";
      this.container.className = "fixed top-5 right-5 z-50 flex flex-col gap-2";
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show a notification
   * @param {string} message - The message to display
   * @param {string} type - The type of notification (success, error, info, warning)
   * @param {number} duration - Duration in milliseconds before auto-dismiss
   */
  show(message, type = "info", duration = 5000) {
    const notification = document.createElement("div");

    // Tailwind classes based on notification type
    const baseClasses =
      "max-w-xs w-full shadow-lg rounded-md p-4 flex items-center justify-between transform transition-all duration-300 ease-in-out";

    let typeClasses = "";
    let icon = "";

    switch (type) {
      case "success":
        typeClasses = "bg-green-50 text-green-800 border-l-4 border-green-500";
        icon = `<svg class="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>`;
        break;
      case "error":
        typeClasses = "bg-red-50 text-red-800 border-l-4 border-red-500";
        icon = `<svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>`;
        break;
      case "warning":
        typeClasses =
          "bg-yellow-50 text-yellow-800 border-l-4 border-yellow-500";
        icon = `<svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>`;
        break;
      default: // info
        typeClasses = "bg-blue-50 text-blue-800 border-l-4 border-blue-500";
        icon = `<svg class="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>`;
    }

    notification.className = `${baseClasses} ${typeClasses} opacity-0 translate-x-5`;
    notification.innerHTML = `
      <div class="flex items-center">
        <div class="flex-shrink-0">
          ${icon}
        </div>
        <div class="ml-3">
          <p class="text-sm font-medium">${message}</p>
        </div>
      </div>
      <div class="ml-4 flex-shrink-0 flex">
        <button class="inline-flex text-gray-400 focus:outline-none focus:text-gray-500 transition ease-in-out duration-150">
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    `;

    // Add to container
    this.container.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.classList.remove("opacity-0", "translate-x-5");
    }, 10);

    // Set up the close button
    const closeButton = notification.querySelector("button");
    closeButton.addEventListener("click", () => this.dismiss(notification));

    // Auto-dismiss after duration
    if (duration) {
      setTimeout(() => this.dismiss(notification), duration);
    }

    return notification;
  }

  dismiss(notification) {
    // Don't dismiss if already being dismissed
    if (notification.classList.contains("dismissing")) return;

    notification.classList.add("dismissing", "opacity-0", "translate-x-5");

    // Remove from DOM after animation completes
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }
}

// Initialize the notification manager
const notificationManager = new NotificationManager();

// Global function to show notifications
window.showNotification = (message, type = "info", duration = 5000) => {
  return notificationManager.show(message, type, duration);
};
