# Native application

This directory contains the Tauri 2 Windows application.

The project-local `.cargo/config.toml` uses the rsproxy sparse registry to make first-time dependency downloads more reliable on mainland China networks. It only affects Cargo commands run from this directory. Remove that file to return to the official crates.io registry.

```powershell
cargo fetch
cargo check
```
