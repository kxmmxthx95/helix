import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui";

describe("Avatar", () => {
  it("lazy-loads and async-decodes the photo", () => {
    const html = renderToStaticMarkup(<Avatar name="A B" src="/x.png" />);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });
  it("falls back to initials without a photo", () => {
    expect(renderToStaticMarkup(<Avatar name="Ann Bee" />)).toContain("AB");
  });
});
