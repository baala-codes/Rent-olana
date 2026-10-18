/**
 * Category codes are accepted by `register_asset` and therefore belong to the
 * on-chain contract. This file only re-exports them so the backend, portal and
 * client cannot disagree about which numeric codes are valid.
 */

export { CATEGORIES, MAX_CATEGORY, categoryLabel } from "../../clients/ts/contract";
