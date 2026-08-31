import type { Express } from "express";
import {
  deleteContact,
  exportContact,
  listContacts,
  mergeContacts,
  updateContact,
} from "../../../modules/contacts/service.js";
import type { HttpContext } from "../../context.js";
import { cleanText } from "../../shared/validation.js";

export function registerContactRoutes(app: Express, context: HttpContext) {
  const { input, audit, adminOnly } = context;

  app.get("/api/admin/contacts", async (_request, response) => {
    response.json(await listContacts(input.pool));
  });

  app.patch("/api/admin/contacts/:id", async (request, response) => {
    const contactId = cleanText(request.params.id, 80);
    const contact = await updateContact(input.pool, contactId, {
      name: cleanText(request.body?.name, 120),
      email: cleanText(request.body?.email, 240),
      phone: cleanText(request.body?.phone, 80),
      notes: cleanText(request.body?.notes, 2000),
    });
    if (!contact) return response.status(404).json({ error: "客户不存在。" });
    response.json(contact);
  });

  app.post(
    "/api/admin/contacts/:id/merge",
    adminOnly,
    async (request, response) => {
      const contactId = cleanText(request.params.id, 80);
      const sourceId = cleanText(request.body?.sourceId, 80);
      if (!sourceId || sourceId === contactId)
        return response.status(400).json({ error: "请选择另一位客户。" });
      await mergeContacts(input.pool, contactId, sourceId);
      await audit(response.locals.user, "merge", "contact", contactId, {
        sourceId,
      });
      response.json({ id: contactId });
    },
  );

  app.get(
    "/api/admin/contacts/:id/export",
    adminOnly,
    async (request, response) => {
      const contactId = cleanText(request.params.id, 80);
      const data = await exportContact(input.pool, contactId);
      if (!data) return response.status(404).json({ error: "客户不存在。" });
      response.attachment(`contact-${contactId}.json`).json(data);
    },
  );

  app.delete(
    "/api/admin/contacts/:id",
    adminOnly,
    async (request, response) => {
      const contactId = cleanText(request.params.id, 80);
      const deleted = await deleteContact(
        input.pool,
        input.mediaDir,
        contactId,
      );
      if (!deleted) return response.status(404).json({ error: "客户不存在。" });
      await audit(response.locals.user, "delete", "contact", contactId);
      response.status(204).end();
    },
  );
}
