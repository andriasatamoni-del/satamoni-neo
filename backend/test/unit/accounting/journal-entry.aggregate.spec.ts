import { JournalEntry } from "../../../src/contexts/accounting/domain/journal-entry.aggregate";
import {
  EmptyJournalEntryError,
  InvalidJournalEntryLineError,
  UnbalancedJournalEntryError,
} from "../../../src/contexts/accounting/domain/errors";

describe("JournalEntry aggregate", () => {
  it("بيسجّل قيد متزن صحيح، بحالة POSTED مباشرة", () => {
    const entry = JournalEntry.register({
      sourceType: "manual",
      lines: [
        { accountId: "acc-1", debit: 100, credit: 0 },
        { accountId: "acc-2", debit: 0, credit: 100 },
      ],
    });
    expect(entry.status).toBe("POSTED");
    expect(entry.postedAt).not.toBeNull();
    expect(entry.entryNumber).toBeNull(); // بيتحدد وقت الحفظ بس (راجع KyselyJournalEntryRepository)
  });

  it("بيرفض قيد بسطر واحد بس", () => {
    expect(() =>
      JournalEntry.register({ sourceType: "manual", lines: [{ accountId: "acc-1", debit: 100, credit: 0 }] })
    ).toThrow(EmptyJournalEntryError);
  });

  it("بيرفض قيد غير متزن", () => {
    expect(() =>
      JournalEntry.register({
        sourceType: "manual",
        lines: [
          { accountId: "acc-1", debit: 100, credit: 0 },
          { accountId: "acc-2", debit: 0, credit: 90 },
        ],
      })
    ).toThrow(UnbalancedJournalEntryError);
  });

  it("بيرفض سطر مدين ودائن مع بعض في نفس الوقت", () => {
    expect(() =>
      JournalEntry.register({
        sourceType: "manual",
        lines: [
          { accountId: "acc-1", debit: 100, credit: 50 },
          { accountId: "acc-2", debit: 0, credit: 50 },
        ],
      })
    ).toThrow(InvalidJournalEntryLineError);
  });

  it("بيرفض سطر مدين وصفر دائن في نفس الوقت (مفيش قيمة خالص)", () => {
    expect(() =>
      JournalEntry.register({
        sourceType: "manual",
        lines: [
          { accountId: "acc-1", debit: 0, credit: 0 },
          { accountId: "acc-2", debit: 0, credit: 0 },
        ],
      })
    ).toThrow(InvalidJournalEntryLineError);
  });

  describe("reverse", () => {
    it("بيرجّع قيد عكسي جديد بمقلوب مدين/دائن، والأصلي بيتحوّل REVERSED", () => {
      const entry = JournalEntry.register({
        sourceType: "manual",
        lines: [
          { accountId: "acc-1", debit: 100, credit: 0 },
          { accountId: "acc-2", debit: 0, credit: 100 },
        ],
      });
      const reversal = entry.reverse({ reason: "خطأ في القيد" });

      expect(entry.status).toBe("REVERSED");
      expect(reversal.status).toBe("POSTED");
      expect(reversal.reversalOfEntryId).toBe(entry.id);
      expect(reversal.lines[0].debit).toBe(0);
      expect(reversal.lines[0].credit).toBe(100);
      expect(reversal.lines[1].debit).toBe(100);
      expect(reversal.lines[1].credit).toBe(0);
    });
  });
});
