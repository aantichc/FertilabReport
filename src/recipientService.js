import { supabaseClient } from "./supabaseClient.js";

export const recipientService = {
  async getRecipients() {
    const recipients = await supabaseClient.listRecipients();
    return recipients.map((recipient) => ({
      id: recipient.id,
      email: recipient.email,
    }));
  },

  async add(email) {
    const normalized = email.trim().toLowerCase();
    const recipients = await this.getRecipients();
    if (!normalized || recipients.some((recipient) => recipient.email === normalized)) return;
    await supabaseClient.createRecipient(normalized);
  },

  async update(id, email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    await supabaseClient.updateRecipient(id, normalized);
  },

  async remove(id) {
    await supabaseClient.deleteRecipient(id);
  },
};
