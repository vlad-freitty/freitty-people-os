/**
 * Phase 5 acceptance: a user receives a notification about a new step within 1 minute (PRD 8).
 * The Telegram Bot API is replaced by a fake transport; everything else is the real path.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DELIVERY_INTERVAL_MS, deliverPending, handleUpdate, setTransport, type TelegramTransport } from "@/server/notifications/telegram";
import { actOnStep, startRequest } from "@/server/requests/engine";
import { getNotificationSettings, listNotifications, markRead, notifyOverdue, setNotificationPrefs, startTelegramLink, unreadCount } from "@/server/services/notifications";
import { activeSteps, buildEngineWorld } from "./engine-world";

type World = Awaited<ReturnType<typeof buildEngineWorld>>;
let w: World;
let sent: { chatId: string; text: string; at: number }[];
let failNext = 0;

const fake: TelegramTransport = {
  async sendMessage(chatId, text) {
    if (failNext > 0) {
      failNext--;
      throw new Error("network down");
    }
    sent.push({ chatId, text, at: Date.now() });
  },
  async getUpdates() {
    return [];
  },
};

beforeEach(async () => {
  w = await buildEngineWorld();
  sent = [];
  failNext = 0;
  setTransport(fake);
});

afterAll(() => setTransport(null));

async function linkTelegram(actor: World["actors"][string], chatId: number) {
  const { code } = await startTelegramLink(actor);
  await handleUpdate({ update_id: 1, message: { chat: { id: chatId }, text: `/start ${code}` } }, fake);
}

describe("linking", () => {
  it("/start with the one-time code links the chat; a wrong code does not", async () => {
    await handleUpdate({ update_id: 1, message: { chat: { id: 555 }, text: "/start NOPE1234" } }, fake);
    expect(sent.at(-1)?.text).toContain("недійсний");
    await linkTelegram(w.actors.H, 777);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.actors.H.userId } })).telegramChatId).toBe("777");
    expect(sent.at(-1)).toMatchObject({ chatId: "777" });
    expect((await getNotificationSettings(w.actors.H)).telegram.linked).toBe(true);
    // a used code cannot be reused by another chat
    await handleUpdate({ update_id: 2, message: { chat: { id: 888 }, text: "/start whatever" } }, fake);
    expect(await prisma.user.count({ where: { telegramChatId: "888" } })).toBe(0);
  });

  it("/stop unlinks the chat", async () => {
    await linkTelegram(w.actors.H, 777);
    await handleUpdate({ update_id: 3, message: { chat: { id: 777 }, text: "/stop" } }, fake);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.actors.H.userId } })).telegramChatId).toBeNull();
  });
});

describe("new step → Telegram within a minute", () => {
  it("the assignee gets an in-app notice and a Telegram message on the next delivery run", async () => {
    await linkTelegram(w.actors.H, 777);
    sent = [];
    const created = Date.now();
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "agent" }] },
    });

    // in-app right away
    const inbox = await listNotifications(w.actors.H, { unread: true });
    expect(inbox.map((n) => n.type)).toEqual(["step_assigned"]);
    expect(await unreadCount(w.actors.H)).toBe(1);

    // the worker delivers every DELIVERY_INTERVAL_MS; one run sends the message
    expect(DELIVERY_INTERVAL_MS).toBeLessThanOrEqual(15_000);
    await deliverPending(fake);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe("777");
    expect(sent[0].text).toContain("Погодження керівником");
    expect(sent[0].text).toContain(`/requests/${id}`);
    expect(sent[0].at - created + DELIVERY_INTERVAL_MS).toBeLessThan(60_000);

    // nothing is sent twice
    await deliverPending(fake);
    expect(sent).toHaveLength(1);
    await markRead(w.actors.H, {});
    expect(await unreadCount(w.actors.H)).toBe(0);
  });

  it("messages use the recipient's language", async () => {
    await prisma.employee.update({ where: { id: w.people.H.id }, data: { locale: "en" } });
    await linkTelegram(w.actors.H, 777);
    sent = [];
    await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
    await deliverPending(fake);
    expect(sent[0].text).toContain("New task: Manager approval");
  });

  it("a failed send is retried, then given up after 5 attempts", async () => {
    await linkTelegram(w.actors.H, 777);
    sent = [];
    await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
    failNext = 1;
    await deliverPending(fake);
    expect(sent).toHaveLength(0);
    await deliverPending(fake);
    expect(sent).toHaveLength(1);

    await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "y" }] } });
    failNext = 99;
    for (let i = 0; i < 6; i++) await deliverPending(fake);
    const n = await prisma.notification.findFirstOrThrow({ where: { channel: "telegram", sentAt: null } });
    expect(n.attempts).toBe(5);
    expect(n.failedAt).not.toBeNull();
  });
});

describe("other events and preferences", () => {
  it("a channel switched off in the profile is not used", async () => {
    await linkTelegram(w.actors.H, 777);
    await setNotificationPrefs(w.actors.H, { step_assigned: { in_app: true, telegram: false } });
    await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
    expect(await prisma.notification.count({ where: { recipientId: w.actors.H.userId, channel: "telegram" } })).toBe(0);
    expect(await prisma.notification.count({ where: { recipientId: w.actors.H.userId, channel: "in_app" } })).toBe(1);
  });

  it("the initiator hears about the result; rejection carries the comment", async () => {
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] },
    });
    await actOnStep(w.actors.H, (await activeSteps(id))[0].id, { action: "reject", comment: "Не на часі" });
    const inbox = await listNotifications(w.actors.S);
    expect(inbox[0]).toMatchObject({ type: "request_rejected", payload: { comment: "Не на часі" } });
  });

  it("an overdue step is announced once to the assignee and the department head", async () => {
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] },
    });
    const step = (await activeSteps(id))[0];
    await prisma.stepInstance.update({ where: { id: step.id }, data: { dueAt: new Date(Date.now() - 3600_000) } });
    const first = await notifyOverdue();
    expect(first.steps).toBe(1);
    expect(await prisma.notification.count({ where: { type: "step_overdue", recipientId: w.actors.H.userId } })).toBe(1);
    const second = await notifyOverdue();
    expect(second.steps).toBe(0);
  });
});
