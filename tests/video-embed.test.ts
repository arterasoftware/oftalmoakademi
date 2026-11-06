import { describe, it, expect } from "vitest";
import { videoEmbedUrl } from "@/lib/queries/materials";

describe("videoEmbedUrl", () => {
  it("YouTube adreslerini gizlilik modlu gömme adresine çevirir", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://m.youtube.com/shorts/abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
  });
  it("Vimeo adreslerini çevirir", () => {
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });
  it("bilinmeyen veya güvensiz adresleri reddeder", () => {
    expect(videoEmbedUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbedUrl("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(videoEmbedUrl("not a url")).toBeNull();
  });
});
