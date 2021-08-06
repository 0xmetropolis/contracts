#!/bin/sh
output=$(npx hardhat run scripts/deploy.js --network rinkeby)

IFS=' ' read -ra ADDRESSES <<< "$output";

VAR_NAMES=("NEXT_PUBLIC_MEMBER_TOKEN_ADDRESS" "NEXT_PUBLIC_SAFE_TELLER_ADDRESS" "NEXT_PUBLIC_RULE_MANAGER_ADDRESS" "NEXT_PUBLIC_CONTROLLER_ADDRESS")

for i in {0..3}; do
    echo "Replacing ${VAR_NAMES[$i]} with value ${ADDRESSES[$i]}"
    printf y | npm run vercel-rm ${VAR_NAMES[$i]} development
    printf ${ADDRESSES[$i]} | npm run vercel-push ${VAR_NAMES[$i]} development
done
