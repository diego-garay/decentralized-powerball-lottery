const { ethers, network } = require("hardhat")
const fs = require("fs")

const FRONT_END_ADDRESSES_FILE = "../powerball-frontend/constants/contractAddresses.json"
const FRONT_END_ABI_FILE = "../powerball-frontend/constants/abi.json"

module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating front end...")
        updateContractAddresses()
        updateAbi()
    }
}

async function updateContractAddresses() {
    const powerball = await ethers.getContract("Powerball")
    const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8"))
    const chainId = network.config.chainId.toString()

    if (chainId in currentAddresses) {
        if (!currentAddresses[chainId].includes(powerball.address)) {
            currentAddresses[chainId].push(powerball.address)
        }
    }
    {
        currentAddresses[chainId] = [powerball.address]
    }
    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddresses))
}

async function updateAbi() {
    const powerball = await ethers.getContract("Powerball")
    fs.writeFileSync(FRONT_END_ABI_FILE, powerball.interface.format(ethers.utils.FormatTypes.json))
}

module.exports.tags = ["all", "frontend"]
