//! Compiles `proto/engine.proto` into the tonic server + client stubs.
//!
//! The generated module is included via `tonic::include_proto!("ticklab.engine")`
//! in `src/grpc_service.rs`. `backend/jobs` (Rust) consumes the client stubs.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure().compile_protos(&["proto/engine.proto"], &["proto"])?;
    println!("cargo:rerun-if-changed=proto/engine.proto");
    Ok(())
}
