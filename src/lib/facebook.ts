/**
 * Facebook Graph API Client for Cambodian Social Sellers
 * Handles:
 * 1. Private Replies (Comment -> Messenger)
 * 2. Messenger Send API (1-on-1 Chat)
 * 3. Page & Webhook Token Verification
 */

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  recipientId?: string;
  error?: string;
}

/**
 * Sends a Private Reply to a user who commented on a Facebook Page post or Live stream.
 * This directly sends a confirmation message to the customer's Messenger inbox!
 *
 * @param pageAccessToken - Page Access Token with `pages_messaging` permission
 * @param commentId - The ID of the comment (from webhook event.value.comment_id)
 * @param messageText - The message to deliver to the customer's Messenger
 */
export async function sendFacebookPrivateReply(
  pageAccessToken: string,
  commentId: string,
  messageText: string
): Promise<SendMessageResult> {
  if (!pageAccessToken || !commentId || !messageText) {
    return { success: false, error: "Missing required parameters (pageAccessToken, commentId, or messageText)" };
  }

  try {
    const url = `${GRAPH_API_BASE}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          comment_id: commentId,
        },
        message: {
          text: messageText,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Facebook Private Reply failed:", data);
      return {
        success: false,
        error: data.error?.message || "Failed to send Facebook Private Reply",
      };
    }

    return {
      success: true,
      messageId: data.message_id,
      recipientId: data.recipient_id,
    };
  } catch (error) {
    console.error("Error sending Facebook Private Reply:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error sending Facebook message",
    };
  }
}

/**
 * Sends a standard 1-on-1 Messenger message to a customer by Page-Scoped ID (PSID).
 *
 * @param pageAccessToken - Page Access Token
 * @param recipientPsid - The PSID of the recipient
 * @param messageText - Text content
 */
export async function sendFacebookMessengerMessage(
  pageAccessToken: string,
  recipientPsid: string,
  messageText: string
): Promise<SendMessageResult> {
  if (!pageAccessToken || !recipientPsid || !messageText) {
    return { success: false, error: "Missing required parameters" };
  }

  try {
    const url = `${GRAPH_API_BASE}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: recipientPsid,
        },
        message: {
          text: messageText,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Facebook Messenger Send failed:", data);
      return {
        success: false,
        error: data.error?.message || "Failed to send Messenger message",
      };
    }

    return {
      success: true,
      messageId: data.message_id,
      recipientId: data.recipient_id,
    };
  } catch (error) {
    console.error("Error sending Messenger message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Validates a Facebook Page Access Token and retrieves Page details.
 */
export async function getFacebookPageDetails(pageAccessToken: string): Promise<{
  valid: boolean;
  pageId?: string;
  pageName?: string;
  error?: string;
}> {
  if (!pageAccessToken) return { valid: false, error: "Token is empty" };

  try {
    const url = `${GRAPH_API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      return { valid: false, error: data.error?.message || "Invalid Token" };
    }
    return {
      valid: true,
      pageId: data.id,
      pageName: data.name,
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Failed to connect to Facebook" };
  }
}
