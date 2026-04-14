FROM rust:1.79-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
# Pre-build deps for layer caching
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/engine /usr/local/bin/engine
EXPOSE 3001
CMD ["engine"]
