const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

// anonymity and decentralization

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Powerball Unit Tests", function () {
          let powerball, powerballTicketPrice, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              powerball = await ethers.getContract("Powerball", deployer)
              powerballTicketPrice = await powerball.getTicketPrice()
          })

          describe("fullfillRandomWords", function () {
              it("Works with live Chainlink Keepers and Chainlink VRF, returns random winner(s)", async function () {
                  const startingTimeStamp = await powerball.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      powerball.once("WinnersPicked", async () => {
                          console.log("WinnersPicked event fired!")
                          try {
                              // add asserts here
                              const recentWinners = await powerball.getRecentWinners()
                              const powerballState = await powerball.getState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await powerball.getLatestTimeStamp()

                              await expect(powerball.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinners.toString(), accounts[0].address)
                              assert.equal(powerballState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(powerballTicketPrice).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })

                      await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
