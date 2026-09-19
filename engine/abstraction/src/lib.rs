[package]
name = "ticklab-engine"
version = "0.1.0"
edition = "2021"

[dependencies]
hatformence

## ขั้นตอน

### 1. ตรู้จักกับ Ollama
Ollamaence
```

Wait, I need to think about what dependencies are actually needed. Let me reconsider.

The engine abstraction layer should wrap the vendored hftbacktest crate. Looking at the hftbacktest structure, it has its own Cargo.toml. The engine abstraction layer should depend on the vendored hftbacktest crate and provide a contract trait.

Let me create a simple Cargo.toml for the engine abstraction layer.
<tool_call>
<function=write>
<parameter=content>
[package]
name = "ticklab-engine"
version = "0.1.0"
edition = "2021"

[dependencies]
```

### 2. Create engine abstraction layer src files
Let me create the engine source files. First, the lib.rs:
<tool_call>
<function=write>
<parameter=content>
/// Simulator contract trait — the engine abstraction layer contract.
/// This trait defines the interface that the backend can use to interact
/// with the underlying backtest engine. Implementations must be deterministic
/// and side-effect free for a given input state.
pub mod contract;

/// Engine-specific implementation over the vendored hftbacktest crate.
pub mod hftbacktest_impl;

### Engine abstraction layer gRPC service
pub mod grpc_service;

### Engine core types and types re-exports
pub mod types;

### Engine core types
pub mod types;

### Engine contract trait
pub mod contract;