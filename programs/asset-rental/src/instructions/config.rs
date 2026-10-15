use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RentalError;
use crate::events::*;
use crate::state::*;

/// Admin-signed creation of the singleton `PlatformConfig`.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Platform admin; pays for the config account.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// `[b"config"]`. Created once, for the lifetime of the program.
    #[account(
        init,
        payer = admin,
        space = PlatformConfig::LEN,
        seeds = [PlatformConfig::SEED_PREFIX],
        bump,
    )]
    pub config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

/// Admin-signed updates to the singleton config.
#[derive(Accounts)]
pub struct SetConfig<'info> {
    /// Must be `config.admin`.
    pub admin: Signer<'info>,

    /// `[b"config"]`, re-derived and bound to the signer.
    #[account(
        mut,
        seeds = [PlatformConfig::SEED_PREFIX],
        bump = config.bump,
        has_one = admin @ RentalError::Unauthorized,
    )]
    pub config: Account<'info, PlatformConfig>,
}

pub fn initialize_config_handler(
    ctx: Context<InitializeConfig>,
    treasury: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, RentalError::FeeTooHigh);
    require!(treasury != Pubkey::default(), RentalError::InvalidTreasury);

    // Bump comes from the shared PDA helper rather than `ctx.bumps`, so the
    // stored value is by construction the canonical bump for this seed set. It
    // is read back as `bump = config.bump` by every instruction that loads the
    // config, and a wrong value there would make the whole program unusable.
    let (_, bump) = PlatformConfig::pda();

    let admin = ctx.accounts.admin.key();
    let config = &mut ctx.accounts.config;
    config.admin = admin;
    config.treasury = treasury;
    config.fee_bps = fee_bps;
    config.paused = false;
    config.bump = bump;

    emit!(ConfigInitialized {
        admin,
        treasury,
        fee_bps,
    });

    Ok(())
}

/// Update treasury, fee, and/or pause state. Every argument is optional so an
/// admin can flip one field without restating the others. Treasury and fee are
/// validated exactly as at initialization.
pub fn set_config_handler(
    ctx: Context<SetConfig>,
    treasury: Option<Pubkey>,
    fee_bps: Option<u16>,
    paused: Option<bool>,
) -> Result<()> {
    if let Some(fee_bps) = fee_bps {
        require!(fee_bps <= MAX_FEE_BPS, RentalError::FeeTooHigh);
        ctx.accounts.config.fee_bps = fee_bps;
    }
    if let Some(treasury) = treasury {
        require!(treasury != Pubkey::default(), RentalError::InvalidTreasury);
        ctx.accounts.config.treasury = treasury;
    }
    if let Some(paused) = paused {
        ctx.accounts.config.paused = paused;
    }

    let config = &ctx.accounts.config;
    emit!(ConfigUpdated {
        admin: config.admin,
        treasury: config.treasury,
        fee_bps: config.fee_bps,
        paused: config.paused,
    });

    Ok(())
}
