const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMT = ethers.utils.parseEther("5")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Addr, subId, vrfCoordinatorV2Mock

    if (chainId == 31337) {
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Addr = vrfCoordinatorV2Mock.address
        const transResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transReceipt = await transResponse.wait(1)
        subId = transReceipt.events[0].args.subId // Fund the subscription
        await vrfCoordinatorV2Mock.fundSubscription(subId, VRF_SUB_FUND_AMT)
    } else {
        vrfCoordinatorV2Addr = networkConfig[chainId]["vrfCoordinatorV2"]
        subId = networkConfig[chainId]["subscriptionId"]
    }

    const ticketPrice = networkConfig[chainId]["ticketPrice"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    const args = [ticketPrice, vrfCoordinatorV2Addr, gasLane, subId, callbackGasLimit, interval]

    const powerball = await deploy("Powerball", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        await vrfCoordinatorV2Mock.addConsumer(subId, powerball.address)
    }

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(powerball.address, args)
    }
}

module.exports.tags = ["all", "powerball"]
