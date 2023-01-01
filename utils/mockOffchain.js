const { ethers, network } = require("hardhat")

async function mockKeepers() {
    const powerball = await ethers.getContract("Powerball")
    const checkData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""))
    const { upkeepNeeded } = await powerball.callStatic.checkUpkeep(checkData)
    if (upkeepNeeded) {
        const tx = await powerball.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.events[1].args.requestId
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (network.config.chainId == 31337) {
            await mockVrf(requestId, powerball)
        }
    } else {
        console.log("No upkeep needed!")
    }
}

async function mockVrf(requestId, powerball) {
    const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, powerball.address)
    console.log("Responded!")
    const recentWinner = await powerball.getRecentWinners()
    const winningNums = await powerball.getLastNumbers()
    console.log(`The winner(s) are: ${recentWinner}`)
    console.log(`The winning numbers were: ${winningNums}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
