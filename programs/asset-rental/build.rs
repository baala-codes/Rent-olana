use std::env;

fn main() {
    // Anchor's and Solana's codegen emit `#[cfg(feature = "...")]` for feature
    // names that are not declared in this crate's manifest. Declaring them as
    // expected values here is the correct alternative to an `allow` attribute:
    // real typos in our own cfgs still warn, and macro-generated code we do not
    // control no longer produces `unexpected_cfgs` noise on newer toolchains.
    println!(
        "cargo:rustc-check-cfg=cfg(feature, values(\"anchor-debug\", \"solana\", \"custom-heap\", \"custom-panic\"))"
    );

    // Solana's `entrypoint!` macro selects the SBF startup path with
    // `#[cfg(target_os = "solana")]`, which host toolchains do not know about.
    println!("cargo:rustc-check-cfg=cfg(target_os, values(\"solana\"))");

    // Keep the toolchain in the loop for the SBF build without requiring it.
    if env::var_os("CARGO_FEATURE_NO_ENTRYPOINT").is_none() {
        println!("cargo:rerun-if-changed=src/lib.rs");
    }
}
