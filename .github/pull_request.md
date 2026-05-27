reference what/that .github/copilot-instructions.md is the same text as claude.md and the both have agent directives to keep them insync, developing in VScode with Git looks for this if you have a copilot acct even if you use Claude through copilot. It just resolved the need to reference claude.md in prompts and only affects copilot users.  I did add lenses to both it for better agent POVs

Add the reason why we have the knows pools endpoint in the PR and in the swagger text

Be sure to add the RPC Reliability Fix to the code and PR
Updated BSC RPC: https://binance.llamarpc.com → https://bsc-rpc.publicnode.com
LlamaRPC blocks US IP addresses (geo-restricted)
PublicNode is globally accessible, free, no rate-limiting issues
Updated in both template and conf files for consistency