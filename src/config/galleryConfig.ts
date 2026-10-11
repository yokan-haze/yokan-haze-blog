import type { GalleryAlbum, GalleryConfig } from "@/types/galleryConfig";
import albumsData from "@/data/gallery.json";

// 相册列表由 src/data/gallery.json 维护，可在 Pages CMS 后台直接增删改。
// 每个相册的图片放在 public/gallery/<id>/ 目录下。
export const galleryConfig: GalleryConfig = {
	albums: albumsData as GalleryAlbum[],

	// 瀑布流最小列宽(px)，浏览器根据容器宽度自动计算列数，默认 240
	columnWidth: 240,
};
