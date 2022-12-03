const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

// anonymity and decentralization

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Powerball Unit Tests", function () {
          let powerball, vrfCoordinatorV2Mock, powerballTicketPrice, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              powerball = await ethers.getContract("Powerball", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              powerballTicketPrice = await powerball.getTicketPrice()
              interval = await powerball.getInterval()
          })

          describe("constructor", function () {
              it("Initializes the game correctly", async function () {
                  const powerballState = (await powerball.getState()).toString()
                  assert.equal(powerballState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterGame", function () {
              it("reverts when ticket price isnt paid", async function () {
                  await expect(powerball.enterGame(1, 2, 3, 4, 5)).to.be.revertedWith(
                      "Powerball__PaymentInsufficient"
                  )
              })

              it("reverts when numbers are out of range (under minimum)", async function () {
                  await expect(
                      powerball.enterGame(0, 2, 3, 4, 5, { value: powerballTicketPrice })
                  ).to.be.revertedWith("Powerball__GuessNotWithinRange")
              })

              it("reverts when numbers are out of range (over maximum)", async function () {
                  await expect(
                      powerball.enterGame(70, 2, 3, 4, 5, { value: powerballTicketPrice })
                  ).to.be.revertedWith("Powerball__GuessNotWithinRange")
              })

              it("players are recorded when they enter the game", async function () {
                  await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  const player = await powerball.getPlayer(0)
                  assert.equal(player, deployer)
              })

              //   it("player guesses are recorded when they enter the game", async function () {
              //       const player = await powerball.getPlayer(0)
              //       ass
              //   })

              it("doesn't allow entrance while powerball is calculating", async function () {
                  await powerball.enterGame(2, 2, 2, 2, 2, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await powerball.performUpkeep([])
                  await expect(
                      powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  ).to.be.revertedWith("Powerball__NotOpen")
              })

              it("emits event on enter", async function () {
                  await expect(
                      powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  ).to.emit(powerball, "GameEntered")
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await powerball.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle isn't open", async function () {
                  await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await powerball.performUpkeep([])
                  const powerballState = (await powerball.getState()).toString()
                  const { upkeepNeeded } = await powerball.callStatic.checkUpkeep([])
                  assert.equal(powerballState, "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await powerball.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await powerball.callStatic.checkUpkeep([])
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  const tx = await powerball.performUpkeep([])
                  assert(tx)
              })

              it("reverts when checkupkeep is false", async function () {
                  await expect(powerball.performUpkeep([])).to.be.revertedWith(
                      "Powerball__UpkeepNotNeeded"
                  )
              })

              it("updates the game state, emits event, and calls vrf coordinator", async function () {
                  await powerball.enterGame(1, 2, 3, 4, 5, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  const txResponse = await powerball.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  const powerballState = (await powerball.getState()).toString()

                  assert(requestId.toNumber() > 0)
                  assert(powerballState == 1)
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await powerball.enterGame(3, 3, 3, 3, 3, { value: powerballTicketPrice })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, powerball.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, powerball.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, resets the lottery, and sends winnings", async function () {
                  const additionalPlayers = 3
                  const startingAccountIndex = 1
                  const accounts = await ethers.getSigners()

                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalPlayers;
                      i++
                  ) {
                      const accountConnectedPowerball = powerball.connect(accounts[i])
                      await accountConnectedPowerball.enterGame(i, i, i, i, i, {
                          value: powerballTicketPrice,
                      })
                  }

                  const startingTimeStamp = await powerball.getLatestTimeStamp()
                  let winnersStartingBalance

                  await new Promise(async (resolve, reject) => {
                      powerball.once("WinnersPicked", async () => {
                          console.log("Found the event!")
                          try {
                              const recentWinners = await powerball.getRecentWinners()
                              const powerballState = await powerball.getState()
                              const endingTimeStamp = await powerball.getLatestTimeStamp()
                              const numPlrs = await powerball.getTotalPlayers()
                              winners = recentWinners
                              let winnersEndingBalance
                              for (let i = 1; i <= 3; i++) {
                                  winnersEndingBalance += await accounts[i].getBalance()
                              }

                              assert.equal(numPlrs.toString(), "0")
                              assert.equal(powerballState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              console.log(
                                  "total winners ending balance: " + winnersEndingBalance.toString()
                              )
                              console.log("ticket price: " + powerballTicketPrice)
                              console.log(
                                  "difference: " +
                                      (winnersEndingBalance.toString() -
                                          winnersStartingBalance.toString())
                              )
                              assert.equal(
                                  winnersEndingBalance.toString(),
                                  (winnersStartingBalance + powerballTicketPrice).toString()
                              )

                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      // mocking chainlink keepers
                      const tx = await powerball.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      // manually make the random numbers generated 1 to see if a winner is picked.
                      for (let i = 1; i <= 3; i++) {
                          winnersStartingBalance += await accounts[i].getBalance()
                      }
                      console.log(
                          "total winners starting balance: " + winnersStartingBalance.toString()
                      )
                      // mocking chailnink vrf, shud emit WinnersPicked()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          powerball.address
                      )
                  })
              })
          })
      })
