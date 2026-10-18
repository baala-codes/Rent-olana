import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import {
  ACCOUNT_LEN,
  ACCOUNT_DISC,
  IX_DISC,
  PROGRAM_ID,
  RENTAL_ERROR_CODE,
  Writer,
  configPda,
  contractDrift,
  decodeAssetListing,
  decodePlatformConfig,
  decodeRentalAgreement,
  ixCreateRental,
  ixSettleRental,
  listingPda,
  parseProgramError,
  programErrorCode,
  rentalPda,
} from "../clients/ts";

/**
 * Client-contract unit tests. These run without a validator:
 *   node --import tsx --test tests/contract.test.ts
 *
 * They pin the two things that made the portal drift from the program before:
 * the discriminators (now generated from the IDL) and the byte layout of
 * instructions/accounts (now written once in `clients/ts/wire.ts`).
 */

const discriminator = (kind: string, name: string): string =>
  createHash("sha256").update(`${kind}:${name}`).digest("hex").slice(0, 16);

const bytes = (data: Uint8Array): string => Buffer.from(data).toString("hex");

describe("client contract", () => {
  it("derives every discriminator from the published names", () => {
    for (const [name, value] of Object.entries(IX_DISC)) {
      assert.equal(value, discriminator("global", name), `instruction ${name}`);
    }
    for (const [name, value] of Object.entries(ACCOUNT_DISC)) {
      assert.equal(value, discriminator("account", name), `account ${name}`);
    }
    // Every instruction the generator saw has a builder entry.
    assert.equal(Object.keys(IX_DISC).length, 12);
  });

  it("reports no drift between the IDL, the client and the builders", () => {
    assert.deepEqual(contractDrift(), []);
  });

  it("encodes create_rental exactly (discriminator + Borsh args + account order)", () => {
    const renter = Keypair.generate().publicKey;
    const listing = Keypair.generate().publicKey;
    const rentalId = Uint8Array.from({ length: 32 }, (_, index) => index);

    const instruction = ixCreateRental(renter, listing, {
      rentalId,
      startTs: 1_700_000_000,
      days: 3,
    });

    const startView = new DataView(new ArrayBuffer(8));
    startView.setBigInt64(0, 1_700_000_000n, true);
    const daysView = new DataView(new ArrayBuffer(2));
    daysView.setUint16(0, 3, true);
    const expected = Buffer.concat([
      Buffer.from(IX_DISC.create_rental, "hex"),
      Buffer.from(rentalId),
      Buffer.from(startView.buffer),
      Buffer.from(daysView.buffer),
    ]);
    assert.equal(bytes(instruction.data), expected.toString("hex"));

    const [rental] = rentalPda(listing, rentalId);
    assert.deepEqual(
      instruction.keys.map((key) => ({
        pubkey: key.pubkey.toBase58(),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      [
        { pubkey: renter.toBase58(), isSigner: true, isWritable: true },
        { pubkey: configPda()[0].toBase58(), isSigner: false, isWritable: false },
        { pubkey: listing.toBase58(), isSigner: false, isWritable: true },
        { pubkey: rental.toBase58(), isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
      ]
    );
    assert.equal(instruction.programId.toBase58(), PROGRAM_ID.toBase58());
  });

  it("encodes settle_rental's eight accounts in declaration order", () => {
    const key = (): PublicKey => Keypair.generate().publicKey;
    const caller = key();
    const listing = key();
    const rental = key();
    const owner = key();
    const treasury = key();
    const renterWallet = key();

    const instruction = ixSettleRental(caller, {
      listing,
      rental,
      ownerWallet: owner,
      platformTreasury: treasury,
      renterWallet,
    });

    assert.equal(bytes(instruction.data), IX_DISC.settle_rental);
    assert.deepEqual(
      instruction.keys.map((meta) => meta.pubkey.toBase58()),
      [
        caller,
        configPda()[0],
        listing,
        rental,
        owner,
        treasury,
        renterWallet,
        SystemProgram.programId,
      ].map((pubkey) => pubkey.toBase58())
    );
  });

  it("derives the listing PDA from (owner, asset_id) and stays deterministic", () => {
    const owner = Keypair.generate().publicKey;
    const assetId = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);

    const first = listingPda(owner, assetId);
    const second = listingPda(owner, assetId);
    assert.deepEqual(first, second);
    assert.deepEqual(
      first[0],
      PublicKey.findProgramAddressSync(
        [Buffer.from("asset"), owner.toBuffer(), Buffer.from(assetId)],
        PROGRAM_ID
      )[0]
    );
  });

  it("decodes an AssetListing at the documented offsets", () => {
    const owner = Keypair.generate().publicKey;
    const currentRental = Keypair.generate().publicKey;
    const address = Keypair.generate().publicKey;
    const assetId = Buffer.alloc(32, 7);
    const metadataHash = Buffer.alloc(32, 9);

    const body = new Writer()
      .pubkey(owner)
      .bytes(assetId)
      .u16(2)
      .u64(5_000_000n)
      .u64(10_000_000n)
      .u16(5)
      .bytes(metadataHash)
      .bool(true)
      .pubkey(currentRental)
      .i64(1_800_000_000n)
      .u64(4n)
      .i64(1_700_000_000n)
      .u8(254)
      .build();

    const data = Buffer.concat([Buffer.from(ACCOUNT_DISC.AssetListing, "hex"), Buffer.from(body)]);
    assert.equal(data.length, ACCOUNT_LEN.AssetListing);

    const listing = decodeAssetListing(address, new Uint8Array(data));
    assert.ok(listing.owner.equals(owner));
    assert.equal(Buffer.from(listing.assetId).toString("hex"), assetId.toString("hex"));
    assert.equal(listing.category, 2);
    assert.equal(listing.pricePerDay, 5_000_000n);
    assert.equal(listing.deposit, 10_000_000n);
    assert.equal(listing.maxDays, 5);
    assert.equal(Buffer.from(listing.metadataHash).toString("hex"), metadataHash.toString("hex"));
    assert.equal(listing.active, true);
    assert.ok(listing.currentRental.equals(currentRental));
    assert.equal(listing.busyUntil, 1_800_000_000n);
    assert.equal(listing.totalRentals, 4n);
    assert.equal(listing.createdAt, 1_700_000_000n);
  });

  it("decodes an RentalAgreement and maps the status byte", () => {
    const [listing, owner, renterWallet] = [
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    ];
    const address = Keypair.generate().publicKey;
    const rentalId = Buffer.alloc(32, 3);

    const body = new Writer()
      .pubkey(listing)
      .pubkey(owner)
      .pubkey(renterWallet)
      .bytes(rentalId)
      .i64(1_700_000_000n)
      .i64(1_700_086_400n)
      .u16(1)
      .u64(5_000_000n)
      .u64(0n)
      .u64(5_000_000n)
      .u8(4)
      .i64(1_700_000_000n)
      .u8(253)
      .build();

    const data = Buffer.concat([Buffer.from(ACCOUNT_DISC.RentalAgreement, "hex"), Buffer.from(body)]);
    assert.equal(data.length, ACCOUNT_LEN.RentalAgreement);

    const rental = decodeRentalAgreement(address, new Uint8Array(data));
    assert.ok(rental.listing.equals(listing));
    assert.equal(rental.days, 1);
    assert.equal(rental.escrow, 5_000_000n);
    assert.equal(rental.status, "Disputed");
  });

  it("decodes PlatformConfig and rejects a wrong discriminator", () => {
    const [admin, treasury] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const address = Keypair.generate().publicKey;
    const body = new Writer().pubkey(admin).pubkey(treasury).u16(250).bool(false).u8(252).build();
    const data = Buffer.concat([Buffer.from(ACCOUNT_DISC.PlatformConfig, "hex"), Buffer.from(body)]);
    assert.equal(data.length, ACCOUNT_LEN.PlatformConfig);

    const config = decodePlatformConfig(address, new Uint8Array(data));
    assert.ok(config.admin.equals(admin));
    assert.ok(config.treasury.equals(treasury));
    assert.equal(config.feeBps, 250);
    assert.equal(config.paused, false);

    assert.throws(
      () => decodePlatformConfig(address, new Uint8Array(data).fill(0, 0, 8)),
      /discriminator/
    );
  });

  it("recovers the program error from the masked web3.js failure", () => {
    // Exactly what Anchor 0.30.1 + web3.js 1.99 produce today: the constructor
    // destructures an options object from (message, logs), so action is
    // undefined and the logs are dropped unless we can re-read them.
    const err = Object.assign(new Error("Unknown action 'undefined'"), {
      logs: ["Program log: Error Code: StartInPast. Error Number: 6007."],
    });

    const failure = parseProgramError(err);
    assert.equal(failure.code, RENTAL_ERROR_CODE.StartInPast);
    assert.equal(failure.name, "StartInPast");
    assert.match(failure.message, /StartInPast: A rental must start/);
    assert.equal(programErrorCode(err), RENTAL_ERROR_CODE.StartInPast);
  });

  it("decodes RPC-style and structured error shapes", () => {
    assert.equal(
      programErrorCode({ message: "failed: custom program error: 0x1777" }),
      RENTAL_ERROR_CODE.StartInPast
    );
    assert.equal(
      programErrorCode({ error: { errorCode: { number: 6008 } } }),
      RENTAL_ERROR_CODE.ListingBusy
    );
    assert.equal(programErrorCode(new Error("user rejected the request")), undefined);
  });

  it("never reports a fake success message for an unknown failure", () => {
    const failure = parseProgramError({ message: "Unknown action 'undefined'" });
    assert.equal(failure.code, undefined);
    assert.match(failure.message, /Unknown action/);
  });
});
