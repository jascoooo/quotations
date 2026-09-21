import { describe, expect, it } from "vitest";
import { attachmentPrefix, htmlToText, parseDrop } from "./folder";

describe("htmlToText", () => {
  it("turns an Outlook HTML body into something the matcher can read", () => {
    const html =
      "<html><head><style>p{color:red}</style></head><body><p>Attended 12/09/2026.</p><p>Garage door &amp; frame damaged.</p><br/>Thanks</body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Attended 12/09/2026.");
    expect(text).toContain("Garage door & frame damaged.");
    expect(text).not.toContain("<");
    expect(text).not.toContain("color:red");
  });

  it("keeps paragraph breaks but collapses runaway whitespace", () => {
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one\ntwo");
    expect(htmlToText("<div>a</div>\n\n\n\n<div>b</div>")).toBe("a\n\nb");
  });
});

describe("parseDrop", () => {
  const full = JSON.stringify({
    id: "AAMkAD",
    conversationId: "conv-1",
    subject: "Extra works request SANC004958",
    from: { name: "Sanctuary", address: "repairs@sanctuary.example" },
    to: ["quotes@rdunham.example"],
    receivedAt: "2026-09-14T08:30:00Z",
    bodyText: "Please quote for the garage door.",
    attachments: ["front.jpg", { name: "damage.jpg" }],
  });

  it("reads a complete drop from the flow", () => {
    const e = parseDrop(full, "msg-1.json");
    expect(e.id).toBe("AAMkAD");
    expect(e.conversationId).toBe("conv-1");
    expect(e.subject).toContain("SANC004958");
    expect(e.from.address).toBe("repairs@sanctuary.example");
    expect(e.to).toEqual(["quotes@rdunham.example"]);
    expect(e.receivedAt).toBe("2026-09-14T08:30:00.000Z");
    expect(e.attachments.map((a) => a.name)).toEqual([
      "front.jpg",
      "damage.jpg",
    ]);
  });

  it("falls back to the file name when the flow sends no id", () => {
    const e = parseDrop(
      JSON.stringify({ subject: "Hello" }),
      "msg-000123.json",
    );
    expect(e.id).toBe("msg-000123");
    expect(e.conversationId).toBe("msg-000123");
  });

  it("accepts an HTML body, because that is what the connector sends by default", () => {
    const e = parseDrop(
      JSON.stringify({
        subject: "x",
        body: "<p>Work order <b>SANC004958</b></p>",
      }),
      "m.json",
    );
    expect(e.bodyText).toBe("Work order SANC004958");
  });

  it("accepts a plain string sender and a single recipient", () => {
    const e = parseDrop(
      JSON.stringify({
        subject: "x",
        from: "someone@example.com",
        to: "me@example.com",
      }),
      "m.json",
    );
    expect(e.from.address).toBe("someone@example.com");
    expect(e.to).toEqual(["me@example.com"]);
  });

  it("splits the semicolon-separated recipient list the connector sends", () => {
    const e = parseDrop(
      JSON.stringify({
        subject: "x",
        to: "quotes@rdunham.co.uk; jake@rdunham.co.uk",
      }),
      "m.json",
    );
    expect(e.to).toEqual(["quotes@rdunham.co.uk", "jake@rdunham.co.uk"]);
  });

  it("uses now when the date is missing or unreadable, rather than producing an invalid one", () => {
    for (const when of [undefined, "not a date"]) {
      const e = parseDrop(
        JSON.stringify({ subject: "x", receivedAt: when }),
        "m.json",
      );
      expect(Number.isNaN(Date.parse(e.receivedAt))).toBe(false);
    }
  });

  it("takes the Outlook connector's own field names, so the flow needs no expressions", () => {
    // Exactly the shape the "new email in a shared mailbox" trigger outputs.
    const trigger = JSON.stringify({
      id: "AAMkAGI2",
      conversationId: "AAQkAGI2",
      subject: "Extra works request SANC005044",
      body: "<html><body><p>Fence panels blown down.</p></body></html>",
      from: "repairs@sanctuary.example",
      receivedDateTime: "2026-09-14T07:15:22+0000",
      hasAttachment: true,
      attachments: [{ name: "fence.jpg" }],
    });
    const e = parseDrop(trigger, "msg-20260914071522123.json");
    expect(e.id).toBe("AAMkAGI2");
    expect(e.subject).toContain("SANC005044");
    expect(e.bodyText).toBe("Fence panels blown down.");
    expect(e.from.address).toBe("repairs@sanctuary.example");
    expect(e.receivedAt.startsWith("2026-09-14T07:15:22")).toBe(true);
    expect(e.attachments[0].name).toBe("fence.jpg");
  });

  it("refuses a file that is not an email, with a reason naming the file", () => {
    expect(() => parseDrop("not json", "broken.json")).toThrow(/broken\.json/);
    expect(() => parseDrop("[]", "list.json")).toThrow(/list\.json/);
    expect(() =>
      parseDrop(JSON.stringify({ subject: "  " }), "empty.json"),
    ).toThrow(/neither a subject nor a body/);
  });

  it("names attachments so they can be matched to files beside the email", () => {
    expect(attachmentPrefix("msg-000123.json")).toBe("msg-000123__");
    expect(attachmentPrefix("MSG.JSON")).toBe("MSG__");
  });
});
