//! Compiles `proto/engine.proto` into the tonic server + client stubs.
//!
//! The generated module is included via `tonic::include_proto!("ticklab.engine")`
//! in `src/grpc_service.rs`. `backend/jobs` (Rust) consumes the client stubs.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Block 2.3 / 2.2 / 2.5 fix (all three lanes repaired independently):
    // tonic-build 0.11's builder method is `compile` (`compile_protos` does not
    // exist); the old call never compiled.
    tonic_build::configure().compile(&["proto/engine.proto"], &["proto"])?;
    println!("cargo:rerun-if-changed=proto/engine.proto");
    Ok(())
}
