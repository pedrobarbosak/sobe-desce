import { describe, expect, it } from "vitest";
import { deepLinkPath, oneTimeTokenIn } from "@/lib/native";

describe("links that open the app", () => {
  it("keeps the path of a site link", () => {
    expect(deepLinkPath("https://sobe-desce.example.com/join/ABCD")).toBe("/join/ABCD");
    expect(deepLinkPath("https://sobe-desce.example.com/g/k57abc/table")).toBe("/g/k57abc/table");
    expect(deepLinkPath("https://sobe-desce.example.com/")).toBe("/");
  });

  it("reads the first segment of the app scheme as the path", () => {
    expect(deepLinkPath("sobedesce://account")).toBe("/account");
    expect(deepLinkPath("sobedesce://join/ABCD")).toBe("/join/ABCD");
  });

  it("drops the one-time sign-in token but keeps any other query", () => {
    expect(deepLinkPath("sobedesce://account?ott=abc123")).toBe("/account");
    expect(deepLinkPath("https://sobe-desce.example.com/account?ott=abc123&tab=linked")).toBe("/account?tab=linked");
    expect(oneTimeTokenIn("sobedesce://account?ott=abc123")).toBe("abc123");
    expect(oneTimeTokenIn("https://sobe-desce.example.com/join/ABCD")).toBeNull();
  });

  it("ignores what is not a link of ours", () => {
    expect(deepLinkPath("mailto:someone@example.com")).toBeNull();
    expect(deepLinkPath("not a url")).toBeNull();
    expect(oneTimeTokenIn("not a url")).toBeNull();
  });
});
