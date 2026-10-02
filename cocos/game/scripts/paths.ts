import { resolve } from 'node:path';

export const project = resolve(import.meta.dir, '..');
export const creator = process.env.COCOS_CREATOR ?? '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
export const executable = resolve(creator, 'Contents/MacOS/CocosCreator');
export const sceneId = 'ad08a105-38b6-49ef-9c68-9f3dbb0e6dd8';
export const bootstrapId = 'e9fc4f1c-f510-4708-812f-fab9c92c0684';
