# Terms register

One file per service. Each records what that service's terms allow OneLineage to do, with the date read, the sources, and quotes of the clauses. See [ADR 0004](../docs/architecture/0004-terms-register.md).

A capability is used only if its verdict is `allowed`. A verdict of `unclear` means no.

The register is being filled in, so for now every service is treated as `unclear` for every capability.
