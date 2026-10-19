/**
 * Live (eased) top height of every wall, written by the wall meshes each frame they animate and read
 * by wall-mounted items so they disappear with the wall they hang on instead of floating.
 */
export const wallHeights = new Map<string, number>();
