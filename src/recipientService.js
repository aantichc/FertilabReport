import { storage } from "./storage.js";

export const recipientService = {
  getRecipients() {
    return storage.getRecipients();
  },

  add(email) {
    const normalized = email.trim().toLowerCase();
    const recipients = this.getRecipients();
    if (!normalized || recipients.some((recipient) => recipient.email === normalized)) return;
    storage.saveRecipients([...recipients, { id: crypto.randomUUID(), email: normalized }]);
  },

  update(id, email) {
    const normalized = email.trim().toLowerCase();
    const recipients = this.getRecipients().map((recipient) =>
      recipient.id === id ? { ...recipient, email: normalized } : recipient,
    );
    storage.saveRecipients(recipients);
  },

  remove(id) {
    storage.saveRecipients(this.getRecipients().filter((recipient) => recipient.id !== id));
  },
};
