/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/asset_rental.json`.
 */
export type AssetRental = {
  "address": "DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ",
  "metadata": {
    "name": "assetRental",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Escrowed native-SOL rentals of physical assets for the Solana asset-rental marketplace POC"
  },
  "instructions": [
    {
      "name": "cancelRental",
      "docs": [
        "Cancel a rental before its start time and refund the renter in full."
      ],
      "discriminator": [
        97,
        204,
        63,
        8,
        84,
        34,
        28,
        43
      ],
      "accounts": [
        {
          "name": "party",
          "docs": [
            "Must be the rental's owner or renter."
          ],
          "signer": true
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          },
          "relations": [
            "rental"
          ]
        },
        {
          "name": "rental",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  110,
                  116,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "rental.rental_id",
                "account": "rentalAgreement"
              }
            ]
          }
        },
        {
          "name": "renterWallet",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeListing",
      "docs": [
        "Close a listing that has no open rental and reclaim its rent."
      ],
      "discriminator": [
        33,
        15,
        192,
        81,
        78,
        175,
        159,
        97
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "listing",
          "docs": [
            "Closed back to `owner`; `close` returns the rent-exempt lamports."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeRental",
      "docs": [
        "Close a settled rental agreement and reclaim its rent."
      ],
      "discriminator": [
        179,
        188,
        113,
        211,
        41,
        232,
        51,
        51
      ],
      "accounts": [
        {
          "name": "rental",
          "docs": [
            "Closed back to the renter; the `close` attribute returns the rent."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  110,
                  116,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "rental.listing",
                "account": "rentalAgreement"
              },
              {
                "kind": "account",
                "path": "rental.rental_id",
                "account": "rentalAgreement"
              }
            ]
          }
        },
        {
          "name": "renterWallet",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createRental",
      "docs": [
        "Book a listing for `[start_ts, start_ts + days * SECONDS_PER_DAY]` and",
        "escrow `price_per_day * days + deposit`."
      ],
      "discriminator": [
        130,
        240,
        153,
        29,
        243,
        149,
        80,
        243
      ],
      "accounts": [
        {
          "name": "renter",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          }
        },
        {
          "name": "rental",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  110,
                  116,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "arg",
                "path": "rentalId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "rentalId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "startTs",
          "type": "i64"
        },
        {
          "name": "days",
          "type": "u16"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "docs": [
        "Create the singleton `PlatformConfig`. Callable once."
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Platform admin; pays for the config account."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "`[b\"config\"]`. Created once, for the lifetime of the program."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "raiseDispute",
      "docs": [
        "Freeze an open rental's escrow until the admin resolves it."
      ],
      "discriminator": [
        41,
        243,
        1,
        51,
        150,
        95,
        246,
        73
      ],
      "accounts": [
        {
          "name": "party",
          "docs": [
            "Must be the rental's owner or renter."
          ],
          "signer": true
        },
        {
          "name": "listing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          },
          "relations": [
            "rental"
          ]
        },
        {
          "name": "rental",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  110,
                  116,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "rental.rental_id",
                "account": "rentalAgreement"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "registerAsset",
      "docs": [
        "Register one rentable asset and its terms."
      ],
      "discriminator": [
        21,
        80,
        155,
        149,
        117,
        207,
        235,
        16
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Listing owner; pays for the account and becomes its authority."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "listing",
          "docs": [
            "New listing. Created with `init`, so a reused `asset_id` fails account",
            "creation and rolls the whole transaction back."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "category",
          "type": "u16"
        },
        {
          "name": "pricePerDay",
          "type": "u64"
        },
        {
          "name": "deposit",
          "type": "u64"
        },
        {
          "name": "maxDays",
          "type": "u16"
        },
        {
          "name": "metadataHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "resolveDispute",
      "docs": [
        "Split a disputed escrow between the rental's owner and renter."
      ],
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Must be `config.admin`."
          ],
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          },
          "relations": [
            "rental"
          ]
        },
        {
          "name": "rental",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  110,
                  116,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "rental.rental_id",
                "account": "rentalAgreement"
              }
            ]
          }
        },
        {
          "name": "ownerWallet",
          "writable": true
        },
        {
          "name": "renterWallet",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ownerShareBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setConfig",
      "docs": [
        "Update treasury, fee, and/or the pause switch. Admin only."
      ],
      "discriminator": [
        108,
        158,
        154,
        175,
        212,
        98,
        52,
        66
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Must be `config.admin`."
          ],
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "docs": [
            "`[b\"config\"]`, re-derived and bound to the signer."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "treasury",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "feeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "paused",
          "type": {
            "option": "bool"
          }
        }
      ]
    },
    {
      "name": "setListingStatus",
      "docs": [
        "Activate or deactivate a listing for new bookings."
      ],
      "discriminator": [
        98,
        66,
        57,
        95,
        13,
        152,
        159,
        154
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "active",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleRental",
      "docs": [
        "Settle a rental: the owner may from `start_ts`, anyone from",
        "`end_ts + GRACE_SECONDS`."
      ],
      "discriminator": [
        149,
        241,
        238,
        219,
        68,
        136,
        110,
        57
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "The owner settling early, or any wallet on the timeout path."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          },
          "relations": [
            "rental"
          ]
        },
        {
          "name": "rental",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  110,
                  116,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "rental.rental_id",
                "account": "rentalAgreement"
              }
            ]
          }
        },
        {
          "name": "ownerWallet",
          "writable": true
        },
        {
          "name": "platformTreasury",
          "writable": true
        },
        {
          "name": "renterWallet",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateAsset",
      "docs": [
        "Update a listing. Price, deposit, and max days are frozen while rented."
      ],
      "discriminator": [
        56,
        126,
        238,
        138,
        192,
        118,
        228,
        172
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.owner",
                "account": "assetListing"
              },
              {
                "kind": "account",
                "path": "listing.asset_id",
                "account": "assetListing"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "pricePerDay",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "deposit",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "maxDays",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "category",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "metadataHash",
          "type": {
            "option": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "assetListing",
      "discriminator": [
        63,
        93,
        166,
        61,
        75,
        89,
        237,
        248
      ]
    },
    {
      "name": "platformConfig",
      "discriminator": [
        160,
        78,
        128,
        0,
        248,
        83,
        230,
        160
      ]
    },
    {
      "name": "rentalAgreement",
      "discriminator": [
        84,
        206,
        204,
        146,
        240,
        218,
        19,
        14
      ]
    }
  ],
  "events": [
    {
      "name": "configInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "listingClosed",
      "discriminator": [
        86,
        219,
        253,
        196,
        184,
        194,
        176,
        78
      ]
    },
    {
      "name": "listingStatusChanged",
      "discriminator": [
        104,
        176,
        127,
        45,
        229,
        105,
        208,
        33
      ]
    },
    {
      "name": "listingUpdated",
      "discriminator": [
        190,
        215,
        199,
        138,
        255,
        248,
        98,
        62
      ]
    },
    {
      "name": "rentalCancelled",
      "discriminator": [
        7,
        110,
        25,
        158,
        197,
        48,
        12,
        238
      ]
    },
    {
      "name": "rentalClosed",
      "discriminator": [
        77,
        252,
        165,
        5,
        168,
        29,
        237,
        40
      ]
    },
    {
      "name": "rentalCreated",
      "discriminator": [
        206,
        80,
        251,
        161,
        126,
        236,
        97,
        167
      ]
    },
    {
      "name": "rentalDisputed",
      "discriminator": [
        58,
        98,
        21,
        125,
        238,
        114,
        240,
        161
      ]
    },
    {
      "name": "rentalResolved",
      "discriminator": [
        22,
        111,
        95,
        120,
        70,
        215,
        128,
        83
      ]
    },
    {
      "name": "rentalSettled",
      "discriminator": [
        170,
        51,
        180,
        247,
        186,
        122,
        168,
        59
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidPrice",
      "msg": "Price per day must be greater than zero lamports."
    },
    {
      "code": 6001,
      "name": "invalidDeposit",
      "msg": "The deposit amount is not acceptable."
    },
    {
      "code": 6002,
      "name": "invalidDuration",
      "msg": "Rental duration must be between 1 day and the listing's max days."
    },
    {
      "code": 6003,
      "name": "invalidCategory",
      "msg": "The category code is not acceptable."
    },
    {
      "code": 6004,
      "name": "listingNotActive",
      "msg": "This listing is deactivated and cannot be booked."
    },
    {
      "code": 6005,
      "name": "platformPaused",
      "msg": "The platform is paused; new rentals are rejected."
    },
    {
      "code": 6006,
      "name": "renterIsOwner",
      "msg": "The listing owner cannot rent their own listing."
    },
    {
      "code": 6007,
      "name": "startInPast",
      "msg": "A rental must start at or after the current chain time."
    },
    {
      "code": 6008,
      "name": "listingBusy",
      "msg": "This listing is already booked at or after the requested start."
    },
    {
      "code": 6009,
      "name": "rentalIdReused",
      "msg": "This rental ID has already been used for this listing."
    },
    {
      "code": 6010,
      "name": "notListingOwner",
      "msg": "The signer is not the owner of this listing."
    },
    {
      "code": 6011,
      "name": "notRentalParty",
      "msg": "Only the rental's owner or renter may do this."
    },
    {
      "code": 6012,
      "name": "invalidStatus",
      "msg": "This account is not in a state that allows this operation."
    },
    {
      "code": 6013,
      "name": "cancelTooLate",
      "msg": "A rental can only be cancelled before its start time."
    },
    {
      "code": 6014,
      "name": "feeTooHigh",
      "msg": "Fee must be at most MAX_FEE_BPS (1000 = 10%)."
    },
    {
      "code": 6015,
      "name": "timeOverflow",
      "msg": "Arithmetic overflow while computing a rental timestamp."
    },
    {
      "code": 6016,
      "name": "invalidPda",
      "msg": "The supplied account does not match its expected PDA."
    },
    {
      "code": 6017,
      "name": "treasuryMismatch",
      "msg": "The treasury account does not match the platform config."
    },
    {
      "code": 6018,
      "name": "depositOverflow",
      "msg": "Arithmetic overflow while computing an escrow amount or split."
    },
    {
      "code": 6019,
      "name": "disputeInProgress",
      "msg": "This rental is frozen by an open dispute; settle and cancel are blocked."
    },
    {
      "code": 6020,
      "name": "unauthorized",
      "msg": "The signer is not authorized for this operation."
    },
    {
      "code": 6021,
      "name": "invalidTreasury",
      "msg": "The treasury address is not acceptable."
    },
    {
      "code": 6022,
      "name": "invalidShare",
      "msg": "The owner share must be at most 10_000 basis points."
    }
  ],
  "types": [
    {
      "name": "assetListing",
      "docs": [
        "One rentable physical asset, owned by the wallet that registered it.",
        "",
        "The on-chain record carries only commercial terms. Location, photos, and",
        "free-text description live off-chain; `metadata_hash` is the commitment to",
        "them, and `category` is the only discovery field the program keeps so the",
        "backend can index a listing without trusting a client-supplied label."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Listing owner: registers the asset, sets terms, settles, is paid."
            ],
            "type": "pubkey"
          },
          {
            "name": "assetId",
            "docs": [
              "Stable 32-byte identifier chosen by the owner at registration."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "category",
            "docs": [
              "Coarse category code for off-chain indexing (numeric by design: no",
              "strings on chain, no PII, no coordinates)."
            ],
            "type": "u16"
          },
          {
            "name": "pricePerDay",
            "docs": [
              "Rental price in integer lamports per day. Always `> 0`."
            ],
            "type": "u64"
          },
          {
            "name": "depositLamports",
            "docs": [
              "Refundable deposit in lamports. May be `0`."
            ],
            "type": "u64"
          },
          {
            "name": "maxDays",
            "docs": [
              "Longest rental this owner accepts, in days. Always `1..=MAX_DAYS`."
            ],
            "type": "u16"
          },
          {
            "name": "metadataHash",
            "docs": [
              "`sha256` (or any 32-byte commitment) of the off-chain listing document."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "active",
            "docs": [
              "When false, `create_rental` is rejected. Open rentals are unaffected."
            ],
            "type": "bool"
          },
          {
            "name": "currentRental",
            "docs": [
              "The rental currently holding this asset, or the default public key when",
              "the listing is free. Cleared by every terminal rental transition."
            ],
            "type": "pubkey"
          },
          {
            "name": "busyUntil",
            "docs": [
              "End of the booking that currently holds this listing, or `0` when the",
              "listing is free. `create_rental` requires `start_ts >= busy_until`, which",
              "is what makes bookings single-occupancy without storing an interval set:",
              "two transactions that both write this account cannot run concurrently, so",
              "the second one always sees the first one's watermark."
            ],
            "type": "i64"
          },
          {
            "name": "totalRentals",
            "docs": [
              "Number of rentals that reached `Completed` on this listing."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "Chain time at which the listing was registered."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configInitialized",
      "docs": [
        "Events are the indexing contract: the backend mirrors rentals from these",
        "logs and treats chain state as the source of truth for funds. Every event",
        "carries the account addresses a consumer needs to re-read, never raw",
        "off-chain content (no coordinates, no PII, no documents).",
        "Emitted by `initialize_config`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "docs": [
        "Emitted by `set_config`; mirrors the config after the update."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "listingClosed",
      "docs": [
        "Emitted by `close_listing`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "listingStatusChanged",
      "docs": [
        "Emitted by `set_listing_status`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "listingUpdated",
      "docs": [
        "Emitted by `register_asset` and `update_asset`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "category",
            "type": "u16"
          },
          {
            "name": "pricePerDay",
            "type": "u64"
          },
          {
            "name": "depositLamports",
            "type": "u64"
          },
          {
            "name": "maxDays",
            "type": "u16"
          },
          {
            "name": "metadataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "platformConfig",
      "docs": [
        "Singleton platform configuration.",
        "",
        "`treasury` and `fee_bps` are read from *this* account by every instruction",
        "that moves lamports. No instruction accepts a treasury or a fee from the",
        "client, so a caller can never redirect a fee or reprice a settlement."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Operations authority: may update this config and resolve disputes."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Receives the platform fee taken from rental price at settlement."
            ],
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "docs": [
              "Fee in basis points, charged on `RentalAgreement::price_total` only.",
              "Always `<= MAX_FEE_BPS`. The deposit is never fee-bearing."
            ],
            "type": "u16"
          },
          {
            "name": "paused",
            "docs": [
              "When true, `create_rental` is rejected. Settlement, cancellation, and",
              "dispute resolution keep working: pausing must never trap escrow."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "rentalAgreement",
      "docs": [
        "One escrowed rental of one listing.",
        "",
        "The agreement is the durable, verifiable record of a rental: parties,",
        "interval, the exact amounts escrowed, and the terminal outcome. Its address",
        "is `[b\"rental\", listing, rental_id]` and it is created with `init`, so a",
        "reused `rental_id` cannot be booked twice — the second transaction fails on",
        "account creation and rolls back entirely. There is no pre-check to race."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "docs": [
              "The `AssetListing` this rental belongs to."
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Listing owner at the time of booking; the settlement payee."
            ],
            "type": "pubkey"
          },
          {
            "name": "renter",
            "docs": [
              "Renter that booked and funded the escrow."
            ],
            "type": "pubkey"
          },
          {
            "name": "rentalId",
            "docs": [
              "Unique 32-byte identifier chosen by the renter before signing."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "startTs",
            "docs": [
              "Unix timestamp the rental starts (inclusive)."
            ],
            "type": "i64"
          },
          {
            "name": "endTs",
            "docs": [
              "Unix timestamp the rental ends; `start_ts + days * SECONDS_PER_DAY`."
            ],
            "type": "i64"
          },
          {
            "name": "days",
            "docs": [
              "Length of the rental in whole days."
            ],
            "type": "u16"
          },
          {
            "name": "priceTotal",
            "docs": [
              "`price_per_day * days` at booking time, frozen for the rental's life."
            ],
            "type": "u64"
          },
          {
            "name": "depositLamports",
            "docs": [
              "Deposit refunded to the renter on every terminal path, frozen at booking",
              "time. Excluded from the platform fee."
            ],
            "type": "u64"
          },
          {
            "name": "escrowLamports",
            "docs": [
              "Lamports escrowed by this agreement: `price_total + deposit_lamports`.",
              "Set to `0` by every terminal transition, which is what makes the",
              "conservation invariant (`sum of payouts == escrow`) checkable on chain."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Lifecycle status."
            ],
            "type": {
              "defined": {
                "name": "rentalStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "docs": [
              "Chain time at which the agreement was created."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "rentalCancelled",
      "docs": [
        "Emitted by `cancel_rental`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "refund",
            "type": "u64"
          },
          {
            "name": "cancelledBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rentalClosed",
      "docs": [
        "Emitted by `close_rental`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "renter",
            "type": "pubkey"
          },
          {
            "name": "rentReclaimed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rentalCreated",
      "docs": [
        "Emitted by `create_rental`.",
        "",
        "`escrow_lamports == price_total + deposit`; the field is `deposit` here and",
        "`deposit_lamports` on the account, matching the event contract."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "renter",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "priceTotal",
            "type": "u64"
          },
          {
            "name": "deposit",
            "type": "u64"
          },
          {
            "name": "escrowLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rentalDisputed",
      "docs": [
        "Emitted by `raise_dispute`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rentalResolved",
      "docs": [
        "Emitted by `resolve_dispute`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "ownerAmount",
            "type": "u64"
          },
          {
            "name": "renterAmount",
            "type": "u64"
          },
          {
            "name": "ownerShareBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "rentalSettled",
      "docs": [
        "Emitted by `settle_rental`. Mirrors the three payouts exactly."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "ownerAmount",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "depositRefund",
            "type": "u64"
          },
          {
            "name": "settledBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rentalStatus",
      "docs": [
        "Lifecycle status of one rental agreement.",
        "",
        "`Reserved` = booked, not yet started. `Active` = an open rental that has",
        "reached its start time. Both are accepted identically by every gate, so a",
        "rental behaves the same in either state; no instruction currently writes",
        "`Active` (there is no separate \"activate\" step), but the variant is part of",
        "the declared contract and can be written by a future instruction without a",
        "migration. The three terminal states never transition again, and `Disputed`",
        "is the only state that freezes escrow."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "reserved"
          },
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "disputed"
          },
          {
            "name": "resolved"
          }
        ]
      }
    }
  ]
};
